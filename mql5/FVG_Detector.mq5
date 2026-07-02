//+------------------------------------------------------------------+
//|                                                 FVG_Detector.mq5 |
//|                          Fair Value Gap Detection & Visualization |
//|                                    ICT Concept Implementation     |
//+------------------------------------------------------------------+
#property copyright "Aegis Terminal"
#property link      ""
#property version   "1.00"
#property description "Detects and visualizes Fair Value Gaps (FVG) from ICT concepts"
#property description "Draws rectangles on gaps between 3-candle sequences"
#property indicator_chart_window
#property indicator_buffers 1
#property indicator_plots   1

//--- Input parameters
input group "=== FVG Detection ==="
input double   FVG_Min_Size_ATR  = 0.15;     // Minimum FVG size as ATR multiplier
input int      ATR_Period         = 14;       // ATR period for min size calc
input bool     Use_Body_Gap       = true;     // Also check body gap (open-close)
input double   Body_Gap_Min       = 0.0;      // Min body gap (0 = auto = same as ATR)

input group "=== Display Settings ==="
input int      Lookback_Bars      = 100;      // How many bars back to scan
input int      Max_FVG_Display    = 10;       // Max FVGs shown at once
input int      Extend_Right       = 20;       // Extend FVG rectangle right by N bars
input bool     Show_Labels        = true;     // Show FVG labels
input bool     Show_Distance      = true;     // Show distance to nearest unfilled FVG
input bool     Remove_Old_FVGs    = true;     // Auto-remove FVGs older than lookback

input group "=== Colors ==="
input color    Bull_FVG_Color     = clrLime;           // Bullish FVG color
input color    Bear_FVG_Color     = clrTomato;         // Bearish FVG color
input color    Bull_FVG_Border    = clrDarkGreen;      // Bullish FVG border
input color    Bear_FVG_Border    = clrDarkRed;        // Bearish FVG border
input color    Filled_FVG_Color   = clrGray;           // Filled FVG color
input color    Label_Color        = clrWhite;          // Label text color
input int      FVG_Alpha          = 60;                // FVG fill opacity (0-255)
input int      Filled_Alpha       = 30;                // Filled FVG opacity (0-255)

//--- Indicator buffer (unused for chart drawing, needed for OnCalculate)
double FVG_Buffer[];

//--- Global constants
#define PREFIX "FVG_"
#define MAX_OBJECTS 200

//+------------------------------------------------------------------+
//| Custom indicator initialization function                          |
//+------------------------------------------------------------------+
int OnInit()
{
   //--- Set indicator buffer
   SetIndexBuffer(0, FVG_Buffer, INDICATOR_DATA);
   PlotIndexSetString(0, PLOT_LABEL, "FVG");
   PlotIndexSetInteger(0, PLOT_DRAW_TYPE, DRAW_NONE);
   
   IndicatorSetString(INDICATOR_SHORTNAME, "FVG Detector");
   
   //--- Clean up old objects on init
   if(IsDeletionAllowed())
      DeleteAllFVGObjects();
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Custom indicator deinitialization function                        |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   DeleteAllFVGObjects();
}

//+------------------------------------------------------------------+
//| Custom indicator iteration function                               |
//+------------------------------------------------------------------+
int OnCalculate(const int rates_total,
                const int prev_calculated,
                const datetime &time[],
                const double &open[],
                const double &high[],
                const double &low[],
                const double &close[],
                const long &tick_volume[],
                const long &volume[],
                const int &spread[])
{
   //--- Minimum bars check
   if(rates_total < ATR_Period + 3)
      return(0);
   
   //--- Calculate ATR for minimum gap sizing
   double atr_buffer[];
   ArrayResize(atr_buffer, 0);
   if(CopyBuffer(NULL, 0, PRICE_TYPICAL, 0, rates_total, atr_buffer) <= 0)
   {
      //--- Fallback: use simple ATR calculation
      ArrayResize(atr_buffer, rates_total);
      CalcSimpleATR(atr_buffer, high, low, close, rates_total, ATR_Period);
   }
   
   //--- Determine scan range
   int scan_start = rates_total - Lookback_Bars - 3;
   if(scan_start < ATR_Period)
      scan_start = ATR_Period;
   
   //--- On full recalculation, delete all existing FVG objects
   if(prev_calculated == 0)
   {
      DeleteAllFVGObjects();
   }
   
   //--- Scan for new FVGs (only check recent bars for efficiency)
   int bars_to_scan = (prev_calculated == 0) ? Lookback_Bars : 5;
   if(bars_to_scan > Lookback_Bars)
      bars_to_scan = Lookback_Bars;
   
   int scan_end = rates_total - 3; // Need at least 3 candles (index 0, 1, 2)
   int scan_begin = scan_end - bars_to_scan;
   if(scan_begin < scan_start)
      scan_begin = scan_start;
   
   //--- Count existing FVGs
   int fvg_count = CountFVGObjects();
   
   //--- Scan candles for FVG patterns
   for(int i = scan_begin; i < scan_end; i++)
   {
      //--- Skip if too many FVGs displayed
      if(fvg_count >= Max_FVG_Display)
         break;
      
      //--- Get candle data (time series: index 0 = oldest in MQL5 arrays)
      //--- Candle[0] = newest of the 3 (at index i+2)
      //--- Candle[1] = middle (at index i+1)
      //--- Candle[2] = oldest (at index i)
      
      //--- Wait, MQL5 OnCalculate receives arrays with index 0 = most recent? 
      //--- Actually in MQL5, arrays can be either direction.
      //--- time[], high[], low[], open[], close[] are series-like:
      //--- index rates_total-1 = oldest bar, index 0 = newest bar
      //--- So: candle[0] = index i (oldest of 3)
      //---     candle[1] = index i+1 (middle)
      //---     candle[2] = index i+2 (newest)
      
      //--- Actually the standard MQL5 convention for OnCalculate:
      //--- Element [0] is the oldest bar (first bar in history)
      //--- Element [rates_total-1] is the newest bar
      //--- This is NOT like CopyRates with CopyBuffer, which returns [0] as newest.
      
      //--- Let me clarify: in OnCalculate, arrays are NOT time-series by default.
      //--- But the user's spec says: candle[2].high < candle[0].low
      //--- This follows the ICT convention where candle[0] is most recent.
      
      //--- With MQL5 OnCalculate arrays: index increases with time (old->new)
      //--- So index i = oldest of 3, i+1 = middle, i+2 = newest
      //--- For ICT: candle[2] (oldest) = index i, candle[0] (newest) = index i+2
      
      //--- Gap detection:
      //--- Bullish FVG: candle[2].high < candle[0].low
      //---   = high[i] < low[i+2]  (old candle high < new candle low)
      //--- Bearish FVG: candle[2].low > candle[0].high
      //---   = low[i] > high[i+2]  (old candle low > new candle high)
      
      double candle0_open  = open[i+2];   // newest
      double candle0_high  = high[i+2];
      double candle0_low   = low[i+2];
      double candle0_close = close[i+2];
      
      double candle2_open  = open[i];     // oldest
      double candle2_high  = high[i];
      double candle2_low   = low[i];
      double candle2_close = close[i];
      
      double gap_bottom, gap_top;
      bool is_bullish = false;
      bool is_bearish = false;
      
      //--- Bullish FVG: gap between candle[2] high and candle[0] low
      if(candle2_high < candle0_low)
      {
         is_bullish = true;
         gap_bottom = candle2_high;   // top of old candle
         gap_top    = candle0_low;    // bottom of new candle
      }
      //--- Bearish FVG: gap between candle[2] low and candle[0] high
      else if(candle2_low > candle0_high)
      {
         is_bearish = true;
         gap_bottom = candle0_high;   // top of new candle (inverted)
         gap_top    = candle2_low;    // bottom of old candle
      }
      
      if(!is_bullish && !is_bearish)
         continue;
      
      //--- Calculate minimum gap size
      double min_gap = atr_buffer[i+2] * FVG_Min_Size_ATR;
      double gap_size = gap_top - gap_bottom;
      
      if(gap_size < min_gap)
         continue;
      
      //--- Body gap check
      if(Use_Body_Gap)
      {
         double body_threshold = (Body_Gap_Min > 0) ? Body_Gap_Min : min_gap;
         double body_gap = MathAbs(candle0_open - candle2_close);
         if(body_gap < body_threshold)
            continue;
      }
      
      //--- Check if this FVG already exists (avoid duplicates)
      if(FVGExists(time[i+2]))
         continue;
      
      //--- Create FVG rectangle
      string name = PREFIX + TimeToString(time[i+2], TIME_DATE|TIME_MINUTES);
      
      datetime rect_left  = time[i];        // start at oldest candle
      datetime rect_right = time[i+2] + Extend_Right * PeriodSeconds();
      
      color fill_clr = is_bullish ? Bull_FVG_Color : Bear_FVG_Color;
      color border_clr = is_bullish ? Bull_FVG_Border : Bear_FVG_Border;
      
      if(ObjectCreate(0, name, OBJ_RECTANGLE, 0, rect_left, gap_top, rect_right, gap_bottom))
      {
         ObjectSetInteger(0, name, OBJPROP_COLOR, border_clr);
         ObjectSetInteger(0, name, OBJPROP_FILL, true);
         ObjectSetInteger(0, name, OBJPROP_BACK, true);
         ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
         ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
         
         //--- Set fill color via border (MQL5 draws fill with border color)
         ObjectSetInteger(0, name, OBJPROP_COLOR, border_clr);
         
         //--- Store metadata via comment
         string meta = is_bullish ? "BULL" : "BEAR";
         meta += "|" + DoubleToString(gap_size, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS));
         meta += "|" + TimeToString(time[i+2], TIME_DATE|TIME_MINUTES);
         meta += "|0";  // fill percentage
         ObjectSetString(0, name, OBJPROP_TEXT, meta);
      }
      else
         continue;
      
      //--- Create label
      if(Show_Labels)
      {
         string lbl_name = name + "_lbl";
         string lbl_text = is_bullish ? "Bull FVG" : "Bear FVG";
         double gap_pips = gap_size / SymbolInfoDouble(_Symbol, SYMBOL_POINT);
         gap_pips = gap_pips / MathPow(10, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS) - 
                    (int)MathLog10(SymbolInfoDouble(_Symbol, SYMBOL_POINT) > 0 ? 
                    SymbolInfoDouble(_Symbol, SYMBOL_POINT) : 1));
         
         //--- Simpler pip calculation
         double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
         int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
         double pips_val = gap_size / point;
         
         //--- For 5-digit brokers, 1 pip = 10 points
         if(digits == 5 || digits == 3)
            pips_val /= 10.0;
         
         lbl_text += " (" + DoubleToString(pips_val, 1) + " pips)";
         
         if(ObjectCreate(0, lbl_name, OBJ_TEXT, 0, time[i+2], gap_top + gap_size * 0.3))
         {
            ObjectSetString(0, lbl_name, OBJPROP_TEXT, lbl_text);
            ObjectSetInteger(0, lbl_name, OBJPROP_COLOR, Label_Color);
            ObjectSetInteger(0, lbl_name, OBJPROP_FONTSIZE, 8);
            ObjectSetString(0, lbl_name, OBJPROP_FONT, "Arial Bold");
            ObjectSetInteger(0, lbl_name, OBJPROP_ANCHOR, ANCHOR_LEFT_LOWER);
            ObjectSetInteger(0, lbl_name, OBJPROP_SELECTABLE, false);
            ObjectSetInteger(0, lbl_name, OBJPROP_HIDDEN, true);
         }
         
         //--- Fill percentage label
         string fill_name = name + "_fill";
         ObjectCreate(0, fill_name, OBJ_TEXT, 0, time[i+2], gap_bottom - gap_size * 0.1);
         ObjectSetString(0, fill_name, OBJPROP_TEXT, "Unfilled");
         ObjectSetInteger(0, fill_name, OBJPROP_COLOR, clrYellow);
         ObjectSetInteger(0, fill_name, OBJPROP_FONTSIZE, 7);
         ObjectSetString(0, fill_name, OBJPROP_FONT, "Arial");
         ObjectSetInteger(0, fill_name, OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
         ObjectSetInteger(0, fill_name, OBJPROP_SELECTABLE, false);
         ObjectSetInteger(0, fill_name, OBJPROP_HIDDEN, true);
      }
      
      fvg_count++;
   }
   
   //--- Update existing FVGs (fill tracking, aging, extension)
   UpdateFVGs(rates_total, time, high, low, open, close);
   
   //--- Remove old FVGs beyond lookback
   if(Remove_Old_FVGs)
      RemoveOldFVGs(rates_total, time);
   
   //--- Show distance to nearest unfilled FVG
   if(Show_Distance)
      ShowNearestFVGDistance(time, rates_total, close);
   
   return(rates_total);
}

//+------------------------------------------------------------------+
//| Update all existing FVG objects (fill check, aging, extension)    |
//+------------------------------------------------------------------+
void UpdateFVGs(const int rates_total, const datetime &time[],
                const double &high[], const double &low[],
                const double &open[], const double &close[])
{
   int total = ObjectsTotal(0, 0, -1);
   
   for(int obj = total - 1; obj >= 0; obj--)
   {
      string name = ObjectName(0, obj, 0, -1);
      
      //--- Only process our FVG rectangles
      if(StringFind(name, PREFIX) != 0)
         continue;
      if(StringFind(name, "_lbl") >= 0 || StringFind(name, "_fill") >= 0 || 
         StringFind(name, "_dist") >= 0)
         continue;
      
      //--- Get metadata
      string meta = ObjectGetString(0, name, OBJPROP_TEXT);
      if(StringLen(meta) == 0)
         continue;
      
      string type_str, time_str, fill_str;
      double gap_size;
      ParseMeta(meta, type_str, gap_size, time_str, fill_str);
      
      bool is_bull = (type_str == "BULL");
      
      //--- Get rectangle boundaries
      datetime left_time = (datetime)ObjectGetInteger(0, name, OBJPROP_TIME, 0);
      double top_price    = ObjectGetDouble(0, name, OBJPROP_PRICE, 0);
      double bottom_price = ObjectGetDouble(0, name, OBJPROP_PRICE, 1);
      datetime right_time = (datetime)ObjectGetInteger(0, name, OBJPROP_TIME, 1);
      
      //--- Convert FVG creation time to bar index
      int fvg_bar = ArrayBSearch(time, left_time, rates_total, 0);
      if(fvg_bar < 0 || fvg_bar >= rates_total)
         continue;
      
      //--- Calculate fill percentage
      //--- Bullish FVG: price fills from top down (price drops into gap)
      //--- Bearish FVG: price fills from bottom up (price rises into gap)
      double fill_pct = 0;
      double fvg_range = top_price - bottom_price;
      
      if(fvg_range <= 0)
         continue;
      
      //--- Check all bars after FVG creation for fill
      int current_bar = rates_total - 1;
      for(int b = fvg_bar + 1; b <= current_bar; b++)
      {
         if(is_bull)
         {
            //--- Bullish FVG fills when price drops into it
            //--- Fill from top: how much of the gap was penetrated downward
            double penetration = top_price - low[b];
            if(penetration > 0)
            {
               double pct = penetration / fvg_range * 100.0;
               if(pct > fill_pct)
                  fill_pct = pct;
            }
         }
         else
         {
            //--- Bearish FVG fills when price rises into it
            //--- Fill from bottom: how much of the gap was penetrated upward
            double penetration = high[b] - bottom_price;
            if(penetration > 0)
            {
               double pct = penetration / fvg_range * 100.0;
               if(pct > fill_pct)
                  fill_pct = pct;
            }
         }
      }
      
      if(fill_pct > 100)
         fill_pct = 100;
      
      //--- Get new fill level from metadata
      double old_fill = StringToDouble(fill_str);
      
      //--- Update if fill changed
      if(MathAbs(fill_pct - old_fill) > 0.1)
      {
         //--- Update metadata
         string new_meta = type_str + "|" + DoubleToString(gap_size, 4) + "|" + 
                          time_str + "|" + DoubleToString(fill_pct, 1);
         ObjectSetString(0, name, OBJPROP_TEXT, new_meta);
         
         //--- Update visual: fill tracking
         UpdateFVGAppearance(name, is_bull, fill_pct);
         
         //--- Update fill label
         string fill_lbl = name + "_fill";
         if(ObjectFind(0, fill_lbl) >= 0)
         {
            string fill_text;
            if(fill_pct >= 100)
               fill_text = "FILLED";
            else if(fill_pct >= 50)
               fill_text = DoubleToString(fill_pct, 0) + "% filled";
            else if(fill_pct > 0)
               fill_text = DoubleToString(fill_pct, 0) + "% touched";
            else
               fill_text = "Unfilled";
            
            ObjectSetString(0, fill_lbl, OBJPROP_TEXT, fill_text);
            
            if(fill_pct >= 100)
               ObjectSetInteger(0, fill_lbl, OBJPROP_COLOR, clrSilver);
            else if(fill_pct >= 50)
               ObjectSetInteger(0, fill_lbl, OBJPROP_COLOR, clrOrange);
            else
               ObjectSetInteger(0, fill_lbl, OBJPROP_COLOR, clrYellow);
         }
         
         //--- Extend right if not fully filled and recent
         if(fill_pct < 100 && current_bar - fvg_bar < Extend_Right + 50)
         {
            datetime new_right = time[current_bar] + Extend_Right * PeriodSeconds();
            ObjectSetInteger(0, name, OBJPROP_TIME, 1, new_right);
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Update FVG visual appearance based on fill percentage             |
//+------------------------------------------------------------------+
void UpdateFVGAppearance(string name, bool is_bullish, double fill_pct)
{
   color clr;
   color border_clr;
   int alpha;
   
   if(fill_pct >= 100)
   {
      //--- Fully filled: gray with low opacity
      clr = Filled_FVG_Color;
      border_clr = clrDarkGray;
      alpha = Filled_Alpha;
   }
   else if(fill_pct >= 50)
   {
      //--- Partially filled: dimmer version of original color
      if(is_bullish)
      {
         clr = ColorDim(Bull_FVG_Color, 0.6);
         border_clr = clrDarkGreen;
      }
      else
      {
         clr = ColorDim(Bear_FVG_Color, 0.6);
         border_clr = clrDarkRed;
      }
      alpha = FVG_Alpha + (int)((Filled_Alpha - FVG_Alpha) * (fill_pct / 100.0));
   }
   else
   {
      //--- Unfilled or lightly touched
      clr = is_bullish ? Bull_FVG_Color : Bear_FVG_Color;
      border_clr = is_bullish ? Bull_FVG_Border : Bear_FVG_Border;
      alpha = FVG_Alpha;
   }
   
   ObjectSetInteger(0, name, OBJPROP_COLOR, border_clr);
}

//+------------------------------------------------------------------+
//| Dim a color by a factor (0.0 = black, 1.0 = original)            |
//+------------------------------------------------------------------+
color ColorDim(color clr, double factor)
{
   uchar r = (uchar)(GetRValue(clr) * factor);
   uchar g = (uchar)(GetGValue(clr) * factor);
   uchar b = (uchar)(GetBValue(clr) * factor);
   return ColorFromRGB(r, g, b);
}

//+------------------------------------------------------------------+
//| Show distance to nearest unfilled FVG                             |
//+------------------------------------------------------------------+
void ShowNearestFVGDistance(const datetime &time[], int rates_total, const double &close[])
{
   //--- Delete old distance display
   string dist_name = PREFIX + "_distance";
   ObjectDelete(0, dist_name);
   
   double current_price = close[rates_total - 1];
   datetime current_time = time[rates_total - 1];
   
   double nearest_dist = DBL_MAX;
   string nearest_info = "";
   
   int total = ObjectsTotal(0, 0, -1);
   
   for(int obj = 0; obj < total; obj++)
   {
      string name = ObjectName(0, obj, 0, -1);
      
      if(StringFind(name, PREFIX) != 0)
         continue;
      if(StringFind(name, "_lbl") >= 0 || StringFind(name, "_fill") >= 0 ||
         StringFind(name, "_dist") >= 0)
         continue;
      
      //--- Get metadata
      string meta = ObjectGetString(0, name, OBJPROP_TEXT);
      if(StringLen(meta) == 0)
         continue;
      
      string type_str, time_str, fill_str;
      double gap_size;
      ParseMeta(meta, type_str, gap_size, time_str, fill_str);
      
      double fill_pct = StringToDouble(fill_str);
      if(fill_pct >= 100)
         continue; // skip filled
      
      bool is_bull = (type_str == "BULL");
      
      double top_price    = ObjectGetDouble(0, name, OBJPROP_PRICE, 0);
      double bottom_price = ObjectGetDouble(0, name, OBJPROP_PRICE, 1);
      double mid_price    = (top_price + bottom_price) / 2.0;
      
      //--- Distance to nearest edge of FVG
      double dist;
      string direction;
      
      if(current_price > top_price)
      {
         dist = current_price - top_price;
         direction = is_bull ? "below" : "above";
      }
      else if(current_price < bottom_price)
      {
         dist = bottom_price - current_price;
         direction = is_bull ? "below" : "above";
      }
      else
      {
         //--- Price is inside the FVG
         dist = 0;
         direction = "INSIDE";
      }
      
      if(dist < nearest_dist)
      {
         nearest_dist = dist;
         
         double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
         int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
         double pips = nearest_dist / point;
         if(digits == 5 || digits == 3)
            pips /= 10.0;
         
         nearest_info = type_str + " FVG: " + direction + " " + DoubleToString(pips, 1) + " pips";
         if(dist == 0)
            nearest_info = "Price INSIDE " + type_str + " FVG";
      }
   }
   
   //--- Display distance info
   if(StringLen(nearest_info) > 0)
   {
      string display = "Nearest unfilled: " + nearest_info;
      
      ObjectCreate(0, dist_name, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, dist_name, OBJPROP_CORNER, CORNER_RIGHT_UPPER);
      ObjectSetInteger(0, dist_name, OBJPROP_XDISTANCE, 10);
      ObjectSetInteger(0, dist_name, OBJPROP_YDISTANCE, 30);
      ObjectSetString(0, dist_name, OBJPROP_TEXT, display);
      ObjectSetString(0, dist_name, OBJPROP_FONT, "Arial");
      ObjectSetInteger(0, dist_name, OBJPROP_FONTSIZE, 9);
      ObjectSetInteger(0, dist_name, OBJPROP_COLOR, clrAqua);
      ObjectSetInteger(0, dist_name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, dist_name, OBJPROP_HIDDEN, true);
   }
}

//+------------------------------------------------------------------+
//| Remove FVGs older than lookback bars                              |
//+------------------------------------------------------------------+
void RemoveOldFVGs(int rates_total, const datetime &time[])
{
   datetime cutoff = time[rates_total - 1] - Lookback_Bars * PeriodSeconds();
   
   int total = ObjectsTotal(0, 0, -1);
   
   for(int obj = total - 1; obj >= 0; obj--)
   {
      string name = ObjectName(0, obj, 0, -1);
      
      if(StringFind(name, PREFIX) != 0)
         continue;
      
      //--- Check rectangle objects
      if(StringFind(name, "_lbl") >= 0 || StringFind(name, "_fill") >= 0 ||
         StringFind(name, "_dist") >= 0)
         continue;
      
      datetime obj_time = (datetime)ObjectGetInteger(0, name, OBJPROP_TIME, 0);
      
      if(obj_time < cutoff)
      {
         //--- Delete rectangle and its associated labels
         ObjectDelete(0, name);
         ObjectDelete(0, name + "_lbl");
         ObjectDelete(0, name + "_fill");
      }
   }
}

//+------------------------------------------------------------------+
//| Check if an FVG already exists for a given time                   |
//+------------------------------------------------------------------+
bool FVGExists(datetime bar_time)
{
   string search = PREFIX + TimeToString(bar_time, TIME_DATE|TIME_MINUTES);
   
   int total = ObjectsTotal(0, 0, -1);
   for(int obj = 0; obj < total; obj++)
   {
      string name = ObjectName(0, obj, 0, -1);
      if(name == search)
         return(true);
   }
   return(false);
}

//+------------------------------------------------------------------+
//| Count existing FVG objects                                        |
//+------------------------------------------------------------------+
int CountFVGObjects()
{
   int count = 0;
   int total = ObjectsTotal(0, 0, -1);
   
   for(int obj = 0; obj < total; obj++)
   {
      string name = ObjectName(0, obj, 0, -1);
      if(StringFind(name, PREFIX) == 0 &&
         StringFind(name, "_lbl") < 0 && 
         StringFind(name, "_fill") < 0 &&
         StringFind(name, "_dist") < 0)
      {
         count++;
      }
   }
   return(count);
}

//+------------------------------------------------------------------+
//| Delete all FVG-related objects                                    |
//+------------------------------------------------------------------+
void DeleteAllFVGObjects()
{
   int total = ObjectsTotal(0, 0, -1);
   
   for(int obj = total - 1; obj >= 0; obj--)
   {
      string name = ObjectName(0, obj, 0, -1);
      if(StringFind(name, PREFIX) == 0)
      {
         ObjectDelete(0, name);
      }
   }
}

//+------------------------------------------------------------------+
//| Parse metadata string: "TYPE|gap_size|time|fill_pct"              |
//+------------------------------------------------------------------+
void ParseMeta(string meta, string &type_str, double &gap_size, 
               string &time_str, string &fill_str)
{
   string parts[];
   int count = StringSplit(meta, '|', parts);
   
   if(count >= 4)
   {
      type_str = parts[0];
      gap_size = StringToDouble(parts[1]);
      time_str = parts[2];
      fill_str = parts[3];
   }
   else
   {
      type_str = "UNK";
      gap_size = 0;
      time_str = "";
      fill_str = "0";
   }
}

//+------------------------------------------------------------------+
//| Simple ATR calculation fallback                                   |
//+------------------------------------------------------------------+
void CalcSimpleATR(double &atr[], const double &high[], const double &low[],
                   const double &close[], int total, int period)
{
   //--- True Range
   double tr[];
   ArrayResize(tr, total);
   tr[0] = high[0] - low[0];
   
   for(int i = 1; i < total; i++)
   {
      double hl = high[i] - low[i];
      double hc = MathAbs(high[i] - close[i-1]);
      double lc = MathAbs(low[i] - close[i-1]);
      tr[i] = MathMax(hl, MathMax(hc, lc));
   }
   
   //--- Simple moving average of TR
   for(int i = 0; i < total; i++)
   {
      if(i < period)
      {
         double sum = 0;
         for(int j = 0; j <= i; j++)
            sum += tr[j];
         atr[i] = sum / (i + 1);
      }
      else
      {
         double sum = 0;
         for(int j = i - period + 1; j <= i; j++)
            sum += tr[j];
         atr[i] = sum / period;
      }
   }
}

//+------------------------------------------------------------------+
//| Check if objects can be deleted (not in strategy tester)          |
//+------------------------------------------------------------------+
bool IsDeletionAllowed()
{
   return !MQLInfoInteger(MQL_OPTIMIZATION) || 
          MQLInfoInteger(MQL_VISUAL_MODE);
}
//+------------------------------------------------------------------+
