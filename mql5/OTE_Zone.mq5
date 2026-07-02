//+------------------------------------------------------------------+
//|                                                OTE_Zone.mq5       |
//|                                  Optimal Trade Entry Zone Indicator|
//+------------------------------------------------------------------+
#property copyright "Aegis Terminal"
#property link      ""
#property version   "1.00"
#property description "OTE (Optimal Trade Entry) Zone Indicator"
#property description "Detects displacement legs and draws Fibonacci OTE zones"
#property strict
#property indicator_chart_window
#property indicator_plots 0

//--- Input parameters
input int      ATR_Period           = 14;        // ATR Period
input double   DisplacementMultiple = 1.5;       // Displacement Threshold (x ATR)
input color    OTE_Color            = clrGold;   // OTE Zone Color
input int      FibLevels            = 5;         // Number of Fib levels to draw
input bool     ShowEquilibrium      = true;      // Show 50% Equilibrium
input bool     ShowOTE              = true;      // Show OTE Zone (62%-79%)
input bool     ShowExtensions       = true;      // Show Extension Levels
input bool     ExtendRight          = true;      // Extend objects to the right
input int      LookbackBars         = 500;       // Lookback bars for displacement scan

//--- Global variables
int    g_atr_handle;
double g_atr_buffer[];
int    g_swing_highs_count;
int    g_swing_lows_count;
datetime g_last_bar_time;
bool   g_initialized;

//--- Swing point structures
struct SwingPoint
{
   double   price;
   datetime time;
   int      bar_index;
};

SwingPoint g_displacement_high;
SwingPoint g_displacement_low;
bool       g_has_displacement;

//+------------------------------------------------------------------+
//| Custom indicator initialization function                          |
//+------------------------------------------------------------------+
int OnInit()
{
   //--- Create ATR handle
   g_atr_handle = iATR(_Symbol, PERIOD_CURRENT, ATR_Period);
   if(g_atr_handle == INVALID_HANDLE)
   {
      Print("ERROR: Failed to create ATR handle. Error: ", GetLastError());
      return(INIT_FAILED);
   }

   //--- Initialize buffers
   ArrayResize(g_atr_buffer, 0);
   g_swing_highs_count = 0;
   g_swing_lows_count  = 0;
   g_last_bar_time     = 0;
   g_initialized       = false;
   g_has_displacement  = false;

   //--- Initialize swing points
   g_displacement_high.price  = 0;
   g_displacement_high.time   = 0;
   g_displacement_high.bar_index = 0;
   g_displacement_low.price   = 0;
   g_displacement_low.time    = 0;
   g_displacement_low.bar_index  = 0;

   //--- Delete old objects on init
   ObjectsDeleteAll(0, "OTE_");

   Print("OTE Zone Indicator initialized. ATR Period: ", ATR_Period,
         " Displacement Multiple: ", DisplacementMultiple);

   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Custom indicator deinitialization function                         |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   //--- Release ATR handle
   if(g_atr_handle != INVALID_HANDLE)
      IndicatorRelease(g_atr_handle);

   //--- Remove all OTE objects from chart
   ObjectsDeleteAll(0, "OTE_");
}

//+------------------------------------------------------------------+
//| Custom indicator iteration function                                |
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
   //--- Check minimum bars
   if(rates_total < ATR_Period + 10)
      return(0);

   //--- Copy ATR buffer
   int copied = CopyBuffer(g_atr_handle, 0, 0, rates_total, g_atr_buffer);
   if(copied <= 0)
   {
      Print("WARNING: Failed to copy ATR buffer. Error: ", GetLastError());
      return(0);
   }

   //--- Determine calculation limit
   int limit;
   if(prev_calculated <= 0)
      limit = rates_total - ATR_Period - 1;
   else
      limit = rates_total - prev_calculated + 1;

   //--- Limit to lookback range
   if(limit > LookbackBars)
      limit = LookbackBars;

   //--- Check if new bar formed
   datetime current_time = iTime(_Symbol, PERIOD_CURRENT, 0);
   bool new_bar = (current_time != g_last_bar_time);
   if(new_bar)
      g_last_bar_time = current_time;

   //--- Scan for displacement leg (process from oldest to newest)
   //    We need to find the most recent displacement candle
   bool found_displacement = false;
   int  disp_direction    = 0;  // 1 = bullish, -1 = bearish, 0 = none

   for(int i = limit; i >= 1; i--)
   {
      if(i >= rates_total - ATR_Period)
         continue;

      double body_size = MathAbs(close[i] - open[i]);
      double atr_val   = g_atr_buffer[i];
      if(atr_val <= 0)
         continue;

      //--- Check if this candle is a displacement candle
      bool is_displacement = (body_size > atr_val * DisplacementMultiple);

      if(is_displacement)
      {
         //--- Determine direction by candle color
         if(close[i] > open[i])
            disp_direction = 1;   // Bullish displacement
         else if(close[i] < open[i])
            disp_direction = -1;  // Bearish displacement
         else
            continue;             // Doji, skip

         //--- Find the swing points of this displacement leg
         //    For bullish: scan left for swing low (leg start), use candle high as leg high
         //    For bearish: scan left for swing high (leg start), use candle low as leg low

         double leg_high = high[i];
         double leg_low  = low[i];
         datetime leg_high_time = time[i];
         datetime leg_low_time  = time[i];
         int leg_high_idx = i;
         int leg_low_idx  = i;

         //--- Scan up to 50 bars back for swing points
         int scan_limit = MathMin(i + 50, rates_total - 1);

         if(disp_direction == 1)
         {
            //--- Bullish displacement: find the lowest low (swing low / leg start)
            double min_low = low[i];
            datetime min_low_time = time[i];
            int min_low_idx = i;

            for(int j = i; j <= scan_limit; j++)
            {
               if(low[j] < min_low)
               {
                  min_low = low[j];
                  min_low_time = time[j];
                  min_low_idx = j;
               }
               //--- Also track highest high in the leg
               if(high[j] > leg_high)
               {
                  leg_high = high[j];
                  leg_high_time = time[j];
                  leg_high_idx = j;
               }
            }

            //--- Store displacement leg
            g_displacement_low.price     = min_low;
            g_displacement_low.time      = min_low_time;
            g_displacement_low.bar_index = min_low_idx;

            g_displacement_high.price     = leg_high;
            g_displacement_high.time      = leg_high_time;
            g_displacement_high.bar_index = leg_high_idx;

            g_has_displacement = true;
            found_displacement = true;
            break;
         }
         else if(disp_direction == -1)
         {
            //--- Bearish displacement: find the highest high (swing high / leg start)
            double max_high = high[i];
            datetime max_high_time = time[i];
            int max_high_idx = i;

            for(int j = i; j <= scan_limit; j++)
            {
               if(high[j] > max_high)
               {
                  max_high = high[j];
                  max_high_time = time[j];
                  max_high_idx = j;
               }
               //--- Also track lowest low in the leg
               if(low[j] < leg_low)
               {
                  leg_low = low[j];
                  leg_low_time = time[j];
                  leg_low_idx = j;
               }
            }

            //--- Store displacement leg
            g_displacement_high.price     = max_high;
            g_displacement_high.time      = max_high_time;
            g_displacement_high.bar_index = max_high_idx;

            g_displacement_low.price     = leg_low;
            g_displacement_low.time      = leg_low_time;
            g_displacement_low.bar_index = leg_low_idx;

            g_has_displacement = true;
            found_displacement = true;
            break;
         }
      }
   }

   //--- Draw OTE zone if displacement found
   if(g_has_displacement && found_displacement)
   {
      DrawOTEObjects(disp_direction, time, rates_total);
   }
   else if(g_has_displacement)
   {
      //--- Redraw with cached displacement (for recalculation)
      //    Determine direction from existing data
      int cached_dir = 0;
      if(g_displacement_high.price > g_displacement_low.price)
      {
         //--- Approximate direction from leg position
         cached_dir = (g_displacement_high.bar_index <= g_displacement_low.bar_index) ? 1 : -1;
      }
      if(cached_dir != 0)
         DrawOTEObjects(cached_dir, time, rates_total);
   }

   return(rates_total);
}

//+------------------------------------------------------------------+
//| Draw all OTE related objects on chart                              |
//+------------------------------------------------------------------+
void DrawOTEObjects(const int direction, const datetime &time[], const int rates_total)
{
   //--- Remove previous OTE objects
   ObjectsDeleteAll(0, "OTE_");

   //--- Get displacement leg prices
   double leg_top = g_displacement_high.price;
   double leg_bot = g_displacement_low.price;
   datetime leg_start_time = g_displacement_low.time;
   datetime leg_end_time   = g_displacement_high.time;

   //--- Ensure correct ordering
   if(leg_top <= leg_bot) return;

   //--- Fib level values (from 0% at one end to 100% at the other)
   //    Bullish: 0% at top (high), 100% at bottom (low) - retracement goes UP
   //    Bearish: 0% at bottom (low), 100% at top (high) - retracement goes DOWN

   double range = leg_top - leg_bot;

   //--- Calculate fib levels
   double fib_79, fib_62, fib_50, fib_382, fib_2618;

   if(direction == 1)
   {
      //--- Bullish displacement: retrace from high down to low
      //    OTE zone is near the low (dip = buy zone)
      fib_79   = leg_top - range * 0.7900;   // 79% retracement
      fib_62   = leg_top - range * 0.6200;   // 62% retracement
      fib_50   = leg_top - range * 0.5000;   // 50% retracement
      fib_382  = leg_top - range * 0.3820;   // 38.2% retracement
      fib_2618 = leg_bot - range * 0.2618;   // 26.18% extension below
   }
   else
   {
      //--- Bearish displacement: retrace from low up to high
      //    OTE zone is near the high (rally = sell zone)
      fib_79   = leg_bot + range * 0.7900;   // 79% retracement
      fib_62   = leg_bot + range * 0.6200;   // 62% retracement
      fib_50   = leg_bot + range * 0.5000;   // 50% retracement
      fib_382  = leg_bot + range * 0.3820;   // 38.2% retracement
      fib_2618 = leg_top + range * 0.2618;   // 26.18% extension above
   }

   //--- Time range for objects
   datetime time_start = leg_start_time;
   datetime time_end;

   if(ExtendRight)
      time_end = time[rates_total - 1] + PeriodSeconds() * 20;
   else
      time_end = leg_end_time + PeriodSeconds() * 5;

   //--- 1. Draw OTE Zone rectangle (62% to 79%)
   if(ShowOTE)
   {
      double ote_top = MathMax(fib_62, fib_79);
      double ote_bot = MathMin(fib_62, fib_79);

      string ote_name = "OTE_Zone_Rect";

      if(ObjectCreate(0, ote_name, OBJ_RECTANGLE, 0, time_start, ote_top, time_end, ote_bot))
      {
         //--- Style: semi-transparent fill with thick border
         ObjectSetInteger(0, ote_name, OBJPROP_COLOR, OTE_Color);
         ObjectSetInteger(0, ote_name, OBJPROP_FILL, true);
         ObjectSetInteger(0, ote_name, OBJPROP_BACK, true);  // Behind candles
         ObjectSetInteger(0, ote_name, OBJPROP_WIDTH, 3);    // Thick border
         ObjectSetInteger(0, ote_name, OBJPROP_STYLE, STYLE_SOLID);

         //--- Set fill opacity (semi-transparent)
         //    MetaTrader uses 0-255 for transparency (0=opaque, 255=transparent)
         ObjectSetInteger(0, ote_name, OBJPROP_BGCOLOR, OTE_Color);
         ObjectSetInteger(0, ote_name, OBJPROP_BGOPACITY, 80);  // ~30% opacity

         //--- Add description label
         string label_name = "OTE_Label";
         string label_text = (direction == 1) ? "OTE BUY ZONE" : "OTE SELL ZONE";
         double label_price = (ote_top + ote_bot) / 2.0;

         ObjectCreate(0, label_name, OBJ_TEXT, 0, time_start, label_price);
         ObjectSetString(0, label_name, OBJPROP_TEXT, label_text);
         ObjectSetInteger(0, label_name, OBJPROP_COLOR, OTE_Color);
         ObjectSetInteger(0, label_name, OBJPROP_FONTSIZE, 9);
         ObjectSetInteger(0, label_name, OBJPROP_ANCHOR, ANCHOR_LEFT);
         ObjectSetInteger(0, label_name, OBJPROP_BACK, false);
      }
   }

   //--- 2. Draw Fib 79% line
   DrawFibLine("OTE_Fib_79", time_start, time_end, fib_79, "79.0%", OTE_Color, STYLE_SOLID, 2);

   //--- 3. Draw Fib 62% line
   DrawFibLine("OTE_Fib_62", time_start, time_end, fib_62, "62.0%", OTE_Color, STYLE_SOLID, 2);

   //--- 4. Draw Fib 50% line (Equilibrium)
   if(ShowEquilibrium)
   {
      DrawFibLine("OTE_Fib_50", time_start, time_end, fib_50, "50.0%", clrWhite, STYLE_DASH, 1);
   }

   //--- 5. Draw Fib 38.2% line
   DrawFibLine("OTE_Fib_382", time_start, time_end, fib_382, "38.2%", clrDodgerBlue, STYLE_DOT, 1);

   //--- 6. Draw Fib 26.18% extension
   if(ShowExtensions)
   {
      DrawFibLine("OTE_Fib_2618", time_start, time_end, fib_2618, "26.18%", clrOrangeRed, STYLE_DOT, 1);
   }

   //--- 7. Draw displacement leg line (high to low)
   string leg_name = "OTE_Leg_Line";
   color  leg_color = (direction == 1) ? clrLime : clrRed;
   ObjectCreate(0, leg_name, OBJ_TREND, 0,
                g_displacement_low.time, leg_bot,
                g_displacement_high.time, leg_top);
   ObjectSetInteger(0, leg_name, OBJPROP_COLOR, leg_color);
   ObjectSetInteger(0, leg_name, OBJPROP_WIDTH, 2);
   ObjectSetInteger(0, leg_name, OBJPROP_STYLE, STYLE_SOLID);
   ObjectSetInteger(0, leg_name, OBJPROP_RAY, false);
   ObjectSetInteger(0, leg_name, OBJPROP_BACK, true);

   //--- 8. Draw small diamonds at swing points
   DrawSwingMarker("OTE_High_Marker", g_displacement_high.time, leg_top,
                   clrWhite, "HIGH");
   DrawSwingMarker("OTE_Low_Marker", g_displacement_low.time, leg_bot,
                   clrWhite, "LOW");

   //--- 9. Direction indicator arrow
   string arrow_name = "OTE_Direction_Arrow";
   datetime arrow_time = leg_end_time;
   double   arrow_price;
   color    arrow_color;
   int      arrow_code;

   if(direction == 1)
   {
      arrow_price  = leg_top + range * 0.05;
      arrow_color  = clrLime;
      arrow_code   = 233;  // Up arrow
   }
   else
   {
      arrow_price  = leg_bot - range * 0.05;
      arrow_color  = clrRed;
      arrow_code   = 234;  // Down arrow
   }

   ObjectCreate(0, arrow_name, OBJ_TEXT, 0, arrow_time, arrow_price);
   ObjectSetString(0, arrow_name, OBJPROP_TEXT, CharToString(arrow_code));
   ObjectSetInteger(0, arrow_name, OBJPROP_COLOR, arrow_color);
   ObjectSetInteger(0, arrow_name, OBJPROP_FONTSIZE, 14);
   ObjectSetInteger(0, arrow_name, OBJPROP_BACK, false);

   //--- Chart update
   ChartRedraw(0);
}

//+------------------------------------------------------------------+
//| Draw a single Fibonacci level line                                 |
//+------------------------------------------------------------------+
void DrawFibLine(string name, datetime time_start, datetime time_end,
                 double price, string label, color clr, ENUM_LINE_STYLE style, int width)
{
   if(ObjectCreate(0, name, OBJ_TREND, 0, time_start, price, time_end, price))
   {
      ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, name, OBJPROP_STYLE, style);
      ObjectSetInteger(0, name, OBJPROP_WIDTH, width);
      ObjectSetInteger(0, name, OBJPROP_RAY, false);
      ObjectSetInteger(0, name, OBJPROP_BACK, false);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);

      //--- Add price label
      string label_name = name + "_Label";
      ObjectCreate(0, label_name, OBJ_TEXT, 0, time_end, price);
      ObjectSetString(0, label_name, OBJPROP_TEXT, "  " + label);
      ObjectSetInteger(0, label_name, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, label_name, OBJPROP_FONTSIZE, 8);
      ObjectSetInteger(0, label_name, OBJPROP_ANCHOR, ANCHOR_LEFT);
      ObjectSetInteger(0, label_name, OBJPROP_BACK, false);
      ObjectSetInteger(0, label_name, OBJPROP_SELECTABLE, false);
   }
}

//+------------------------------------------------------------------+
//| Draw a small marker at a swing point                               |
//+------------------------------------------------------------------+
void DrawSwingMarker(string name, datetime time_pos, double price,
                     color clr, string text)
{
   string marker_text = "◆ " + text;
   if(ObjectCreate(0, name, OBJ_TEXT, 0, time_pos, price))
   {
      ObjectSetString(0, name, OBJPROP_TEXT, marker_text);
      ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 7);
      ObjectSetInteger(0, name, OBJPROP_ANCHOR, ANCHOR_CENTER);
      ObjectSetInteger(0, name, OBJPROP_BACK, false);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   }
}

//+------------------------------------------------------------------+
//| Chart event handler (optional, for tooltip/hover info)             |
//+------------------------------------------------------------------+
void OnChartEvent(const int id,
                  const long &lparam,
                  const double &dparam,
                  const string &sparam)
{
   //--- Placeholder for future interactivity (click to cycle displacement legs, etc.)
   if(id == CHARTEVENT_CHART_CHANGE)
   {
      //--- Redraw on chart resize/scroll
      ChartRedraw(0);
   }
}
//+------------------------------------------------------------------+
