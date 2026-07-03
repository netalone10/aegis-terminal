//+------------------------------------------------------------------+
//| Silver Bullet Indicator.mq5                                      |
//| Detects ICT Silver Bullet setups (FVG + Time Window)            |
//| Works best on M5-M15 timeframes                                  |
//+------------------------------------------------------------------+
#property copyright "Aegis Terminal"
#property link      ""
#property version   "1.00"
#property strict
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

//--- Input parameters
input int      London_Close_Start  = 20;        // London Close start (WIB hour)
input int      London_Close_End    = 22;        // London Close end (WIB hour)
input int      NY_Start            = 22;        // NY Session start (WIB hour)
input int      NY_End              = 25;        // NY Session end (WIB hour, 25 = 01:00 next day)
input double   FVG_Min_Size        = 0.15;      // FVG minimum size (ATR multiple)
input int      ATR_Period          = 14;        // ATR period
input int      EMA_Fast            = 20;        // Fast EMA period
input int      EMA_Slow            = 50;        // Slow EMA period
input int      FVG_Max_Lookback    = 50;        // Max candles to scan for FVG
input double   TP1_RR              = 1.0;       // TP1 Risk:Reward ratio
input double   TP2_RR              = 2.0;       // TP2 Risk:Reward ratio
input double   SL_Buffer_Pips      = 5.0;       // SL buffer in pips
input color    Col_Window          = clrDarkSlateGray; // Time window background color
input color    Col_FVG_Bull        = clrGold;          // Bullish FVG zone color
input color    Col_FVG_Bear        = clrGold;          // Bearish FVG zone color
input color    Col_Setup_Bull      = clrLime;          // Bullish setup label color
input color    Col_Setup_Bear      = clrRed;           // Bearish setup label color
input color    Col_SL              = clrOrangeRed;     // SL line color
input color    Col_TP1             = clrDodgerBlue;    // TP1 line color
input color    Col_TP2             = clrMediumSpringGreen; // TP2 line color
input bool     Enable_Alerts      = true;       // Enable alerts
input bool     Enable_Popup       = true;       // Enable popup alert
input bool     Enable_Sound       = true;       // Enable sound alert
input bool     Enable_Push        = false;      // Enable push notification
input string   Alert_Sound        = "alert.wav"; // Alert sound file

//--- Indicator buffers
double   g_ema_fast[];
double   g_ema_slow[];
double   g_atr[];
int      g_ema_fast_handle;
int      g_ema_slow_handle;
int      g_atr_handle;

//--- FVG structure
struct FVGInfo
{
   double   high;
   double   low;
   int      type;       // 0=bullish, 1=bearish
   datetime time;
   bool     valid;
};

//--- Globals
datetime g_last_alert_time = 0;
int      g_window_counter = 0;

//+------------------------------------------------------------------+
//| Custom indicator initialization function                         |
//+------------------------------------------------------------------+
int OnInit()
{
   //--- Create indicator handles
   g_ema_fast_handle = iMA(_Symbol, PERIOD_CURRENT, EMA_Fast, 0, MODE_EMA, PRICE_CLOSE);
   g_ema_slow_handle = iMA(_Symbol, PERIOD_CURRENT, EMA_Slow, 0, MODE_EMA, PRICE_CLOSE);
   g_atr_handle      = iATR(_Symbol, PERIOD_CURRENT, ATR_Period);

   if(g_ema_fast_handle == INVALID_HANDLE || g_ema_slow_handle == INVALID_HANDLE || g_atr_handle == INVALID_HANDLE)
   {
      Print("Failed to create indicator handles");
      return(INIT_FAILED);
   }

   ArrayResize(g_ema_fast, 0);
   ArrayResize(g_ema_slow, 0);
   ArrayResize(g_atr, 0);

   return(INIT_SUCCEEDED);
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
   if(rates_total < EMA_Slow + 2)
      return(0);

   //--- Get indicator values
   int to_copy = rates_total - prev_calculated;
   if(prev_calculated == 0)
      to_copy = rates_total;

   ArrayResize(g_ema_fast, rates_total);
   ArrayResize(g_ema_slow, rates_total);
   ArrayResize(g_atr, rates_total);

   if(CopyBuffer(g_ema_fast_handle, 0, 0, rates_total, g_ema_fast) <= 0 ||
      CopyBuffer(g_ema_slow_handle, 0, 0, rates_total, g_ema_slow) <= 0 ||
      CopyBuffer(g_atr_handle, 0, 0, rates_total, g_atr) <= 0)
   {
      return(0);
   }

   //--- Process from last calculated bar
   int start = prev_calculated - 1;
   if(start < EMA_Slow) start = EMA_Slow;

   //--- Clean old objects on first call
   if(prev_calculated == 0)
   {
      CleanObjects();
   }

   //--- Find active FVGs
   FVGInfo fvgs[];
   FindFVGs(rates_total, time, high, low, close, fvgs);

   //--- Check current bar
   int last = rates_total - 1;
   datetime current_time = time[last];
   double current_price = close[last];
   double current_atr = g_atr[last];

   //--- Check if within Silver Bullet window (WIB = server time + 7)
   bool in_window = IsInSilverBulletWindow(current_time);

   if(!in_window)
   {
      //--- Still draw existing FVG zones for reference
      DrawFVGZones(fvgs, time, last);
      return(rates_total);
   }

   //--- Check trend condition
   int trend = 0; // 0=none, 1=bullish, -1=bearish
   if(g_ema_fast[last] > g_ema_slow[last] && g_ema_fast[last - 1] > g_ema_slow[last - 1])
      trend = 1;
   else if(g_ema_fast[last] < g_ema_slow[last] && g_ema_fast[last - 1] < g_ema_slow[last - 1])
      trend = -1;

   //--- Draw time window
   DrawTimeWindow(current_time, current_atr);

   //--- Draw FVG zones
   DrawFVGZones(fvgs, time, last);

   //--- Check if price is in any FVG
   bool setup_found = false;
   int setup_type = 0;
   double entry = 0, sl = 0, tp1 = 0, tp2 = 0;
   double fvg_high = 0, fvg_low = 0;

   for(int i = ArraySize(fvgs) - 1; i >= 0; i--)
   {
      if(!fvgs[i].valid)
         continue;

      bool in_fvg = (current_price >= fvgs[i].low && current_price <= fvgs[i].high);

      if(!in_fvg)
         continue;

      //--- Check trend alignment
      if(trend == 1 && fvgs[i].type == 0) // Bullish FVG + bullish trend
      {
         setup_found = true;
         setup_type = 1;
         fvg_high = fvgs[i].high;
         fvg_low = fvgs[i].low;
         entry = current_price;
         sl = fvgs[i].low - current_atr * SL_Buffer_Pips / 10.0;
         double risk = entry - sl;
         tp1 = entry + risk * TP1_RR;
         tp2 = entry + risk * TP2_RR;
         break;
      }
      else if(trend == -1 && fvgs[i].type == 1) // Bearish FVG + bearish trend
      {
         setup_found = true;
         setup_type = -1;
         fvg_high = fvgs[i].high;
         fvg_low = fvgs[i].low;
         entry = current_price;
         sl = fvgs[i].high + current_atr * SL_Buffer_Pips / 10.0;
         double risk = sl - entry;
         tp1 = entry - risk * TP1_RR;
         tp2 = entry - risk * TP2_RR;
         break;
      }
   }

   //--- Draw setup if active
   if(setup_found)
   {
      DrawSetup(setup_type, current_time, entry, sl, tp1, tp2, fvg_high, fvg_low, current_atr);
      FireAlert(current_time, current_price);
   }

   return(rates_total);
}

//+------------------------------------------------------------------+
//| Check if current time is within Silver Bullet window             |
//+------------------------------------------------------------------+
bool IsInSilverBulletWindow(datetime server_time)
{
   //--- Convert to WIB (UTC+7): server_time is broker time
   MqlDateTime dt;
   TimeToStruct(server_time, dt);

   //--- Assume server is UTC, add 7 for WIB
   int wib_hour = (dt.hour + 7) % 24;
   int wib_min  = dt.min;
   int wib_time_min = wib_hour * 60 + wib_min;

   //--- London Close window
   int lc_start = London_Close_Start * 60;
   int lc_end   = London_Close_End * 60;

   //--- NY Session window
   int ny_start = NY_Start * 60;
   int ny_end   = NY_End * 60;

   //--- Check London Close
   if(wib_time_min >= lc_start && wib_time_min <= lc_end)
      return true;

   //--- Check NY Session (handles midnight crossing)
   if(ny_end > 1440) // Wraps past midnight
   {
      if(wib_time_min >= ny_start || wib_time_min <= (ny_end - 1440))
         return true;
   }
   else
   {
      if(wib_time_min >= ny_start && wib_time_min <= ny_end)
         return true;
   }

   return false;
}

//+------------------------------------------------------------------+
//| Find Fair Value Gaps from recent candles                         |
//+------------------------------------------------------------------+
void FindFVGs(int rates_total, const datetime &time[], const double &high[],
              const double &low[], const double &close[], FVGInfo &fvgs[])
{
   ArrayResize(fvgs, 0);

   int lookback = MathMin(FVG_Max_Lookback, rates_total - 4);
   double current_atr = g_atr[rates_total - 1];

   //--- Scan for FVGs (candle[0] and candle[2] don't overlap)
   for(int i = rates_total - 3; i >= rates_total - lookback - 3 && i >= 3; i--)
   {
      double gap_size = 0;

      //--- Bullish FVG: candle[i].low > candle[i+2].high (gap up)
      if(low[i] > high[i + 2])
      {
         gap_size = low[i] - high[i + 2];

         if(gap_size >= current_atr * FVG_Min_Size)
         {
            FVGInfo fvg;
            fvg.high = low[i];
            fvg.low  = high[i + 2];
            fvg.type = 0; // bullish
            fvg.time = time[i];
            fvg.valid = true;
            ArrayResize(fvgs, ArraySize(fvgs) + 1);
            fvgs[ArraySize(fvgs) - 1] = fvg;
         }
      }
      //--- Bearish FVG: candle[i].high < candle[i+2].low (gap down)
      else if(high[i] < low[i + 2])
      {
         gap_size = low[i + 2] - high[i];

         if(gap_size >= current_atr * FVG_Min_Size)
         {
            FVGInfo fvg;
            fvg.high = low[i + 2];
            fvg.low  = high[i];
            fvg.type = 1; // bearish
            fvg.time = time[i];
            fvg.valid = true;
            ArrayResize(fvgs, ArraySize(fvgs) + 1);
            fvgs[ArraySize(fvgs) - 1] = fvg;
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Draw time window as vertical shaded rectangle                   |
//+------------------------------------------------------------------+
void DrawTimeWindow(datetime current_time, double atr)
{
   MqlDateTime dt;
   TimeToStruct(current_time, dt);

   int wib_hour = (dt.hour + 7) % 24;
   int wib_min  = dt.min;

   //--- Determine which window we're in
   bool in_lc = (wib_hour * 60 + wib_min >= London_Close_Start * 60 &&
                 wib_hour * 60 + wib_min <= London_Close_End * 60);
   bool in_ny = false;
   if(NY_End > 1440)
      in_ny = (wib_hour * 60 + wib_min >= NY_Start * 60 ||
               wib_hour * 60 + wib_min <= (NY_End - 1440) * 60);
   else
      in_ny = (wib_hour * 60 + wib_min >= NY_Start * 60 &&
               wib_hour * 60 + wib_min <= NY_End * 60);

   if(!in_lc && !in_ny) return;

   string prefix = in_lc ? "SB_LC_" : "SB_NY_";
   string name = prefix + TimeToString(current_time, TIME_DATE);

   double price_max = iHigh(_Symbol, PERIOD_CURRENT, iHighest(_Symbol, PERIOD_CURRENT, MODE_HIGH, 20, 0)) + atr * 2;
   double price_min = iLow(_Symbol, PERIOD_CURRENT, iLowest(_Symbol, PERIOD_CURRENT, MODE_LOW, 20, 0)) - atr * 2;

   //--- Draw rectangle
   if(ObjectFind(0, name) < 0)
   {
      datetime start_time, end_time;

      if(in_lc)
      {
         start_time = current_time - wib_min * 60 - (wib_hour - London_Close_Start) * 3600;
         end_time   = start_time + (London_Close_End - London_Close_Start) * 3600;
      }
      else
      {
         start_time = current_time - wib_min * 60 - (wib_hour - (NY_Start % 24)) * 3600;
         if(NY_End > 1440)
            end_time = start_time + (NY_End - NY_Start) * 3600;
         else
            end_time = start_time + (NY_End - NY_Start) * 3600;
      }

      ObjectCreate(0, name, OBJ_RECTANGLE, 0, start_time, price_max, end_time, price_min);
      ObjectSetInteger(0, name, OBJPROP_COLOR, Col_Window);
      ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_SOLID);
      ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
      ObjectSetInteger(0, name, OBJPROP_FILL, true);
      ObjectSetInteger(0, name, OBJPROP_BACK, true);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   }
}

//+------------------------------------------------------------------+
//| Draw FVG zones as highlighted rectangles                        |
//+------------------------------------------------------------------+
void DrawFVGZones(FVGInfo &fvgs[], const datetime &time[], int last_bar)
{
   for(int i = ArraySize(fvgs) - 1; i >= 0; i--)
   {
      if(!fvgs[i].valid) continue;

      string type_label = (fvgs[i].type == 0) ? "BULL" : "BEAR";
      string name = "FVG_" + type_label + "_" + IntegerToString(i) + "_" +
                    TimeToString(fvgs[i].time, TIME_DATE | TIME_MINUTES);

      //--- Remove old if exists
      if(ObjectFind(0, name) >= 0)
         ObjectDelete(0, name);

      datetime end_time = time[last_bar] + PeriodSeconds() * 5;

      color fill_color = (fvgs[i].type == 0) ? Col_FVG_Bull : Col_FVG_Bear;

      ObjectCreate(0, name, OBJ_RECTANGLE, 0,
                   fvgs[i].time, fvgs[i].high, end_time, fvgs[i].low);
      ObjectSetInteger(0, name, OBJPROP_COLOR, fill_color);
      ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_SOLID);
      ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
      ObjectSetInteger(0, name, OBJPROP_FILL, true);
      ObjectSetInteger(0, name, OBJPROP_BACK, true);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);

      //--- Label
      string lbl_name = name + "_lbl";
      if(ObjectFind(0, lbl_name) >= 0)
         ObjectDelete(0, lbl_name);

      ObjectCreate(0, lbl_name, OBJ_TEXT, 0,
                   fvgs[i].time, fvgs[i].high + (fvgs[i].high - fvgs[i].low) * 0.2);
      ObjectSetString(0, lbl_name, OBJPROP_TEXT, "FVG " + type_label);
      ObjectSetInteger(0, lbl_name, OBJPROP_COLOR, fill_color);
      ObjectSetInteger(0, lbl_name, OBJPROP_FONTSIZE, 7);
      ObjectSetInteger(0, lbl_name, OBJPROP_SELECTABLE, false);
   }
}

//+------------------------------------------------------------------+
//| Draw Silver Bullet setup with entry, SL, TP levels              |
//+------------------------------------------------------------------+
void DrawSetup(int setup_type, datetime current_time, double entry,
               double sl, double tp1, double tp2,
               double fvg_high, double fvg_low, double atr)
{
   string prefix = (setup_type == 1) ? "SB_BULL_" : "SB_BEAR_";
   string time_str = TimeToString(current_time, TIME_DATE | TIME_MINUTES);

   //--- Remove old setup objects
   ObjectsDeleteAll(0, "SB_BULL_");
   ObjectsDeleteAll(0, "SB_BEAR_");

   //--- Arrow + Label
   string arrow_name = prefix + "ARROW";
   ObjectCreate(0, arrow_name, OBJ_TEXT, 0, current_time, entry);
   ObjectSetString(0, arrow_name, OBJPROP_TEXT,
                   setup_type == 1 ? "▲ SILVER BULLET ▲" : "▼ SILVER BULLET ▼");
   ObjectSetInteger(0, arrow_name, OBJPROP_COLOR,
                    setup_type == 1 ? Col_Setup_Bull : Col_Setup_Bear);
   ObjectSetInteger(0, arrow_name, OBJPROP_FONTSIZE, 10);
   ObjectSetInteger(0, arrow_name, OBJPROP_ANCHOR,
                    setup_type == 1 ? ANCHOR_CENTER : ANCHOR_CENTER);
   ObjectSetInteger(0, arrow_name, OBJPROP_SELECTABLE, false);

   //--- Entry line
   string entry_name = prefix + "ENTRY";
   ObjectCreate(0, entry_name, OBJ_HLINE, 0, current_time, entry);
   ObjectSetInteger(0, entry_name, OBJPROP_COLOR, setup_type == 1 ? Col_Setup_Bull : Col_Setup_Bear);
   ObjectSetInteger(0, entry_name, OBJPROP_STYLE, STYLE_SOLID);
   ObjectSetInteger(0, entry_name, OBJPROP_WIDTH, 2);
   ObjectSetString(0, entry_name, OBJPROP_TEXT, "ENTRY");
   ObjectSetInteger(0, entry_name, OBJPROP_SELECTABLE, false);

   //--- SL line
   string sl_name = prefix + "SL";
   ObjectCreate(0, sl_name, OBJ_HLINE, 0, current_time, sl);
   ObjectSetInteger(0, sl_name, OBJPROP_COLOR, Col_SL);
   ObjectSetInteger(0, sl_name, OBJPROP_STYLE, STYLE_DASH);
   ObjectSetInteger(0, sl_name, OBJPROP_WIDTH, 1);
   ObjectSetString(0, sl_name, OBJPROP_TEXT, "SL");
   ObjectSetInteger(0, sl_name, OBJPROP_SELECTABLE, false);

   //--- SL label
   string sl_lbl = prefix + "SL_LBL";
   ObjectCreate(0, sl_lbl, OBJ_TEXT, 0, current_time, sl);
   ObjectSetString(0, sl_lbl, OBJPROP_TEXT,
                   "SL: " + DoubleToString(sl, _Digits));
   ObjectSetInteger(0, sl_lbl, OBJPROP_COLOR, Col_SL);
   ObjectSetInteger(0, sl_lbl, OBJPROP_FONTSIZE, 8);
   ObjectSetInteger(0, sl_lbl, OBJPROP_SELECTABLE, false);

   //--- TP1 line
   string tp1_name = prefix + "TP1";
   ObjectCreate(0, tp1_name, OBJ_HLINE, 0, current_time, tp1);
   ObjectSetInteger(0, tp1_name, OBJPROP_COLOR, Col_TP1);
   ObjectSetInteger(0, tp1_name, OBJPROP_STYLE, STYLE_DASH);
   ObjectSetInteger(0, tp1_name, OBJPROP_WIDTH, 1);
   ObjectSetString(0, tp1_name, OBJPROP_TEXT, "TP1");
   ObjectSetInteger(0, tp1_name, OBJPROP_SELECTABLE, false);

   //--- TP1 label
   string tp1_lbl = prefix + "TP1_LBL";
   ObjectCreate(0, tp1_lbl, OBJ_TEXT, 0, current_time, tp1);
   ObjectSetString(0, tp1_lbl, OBJPROP_TEXT,
                   "TP1 (1:" + DoubleToString(TP1_RR, 0) + "): " + DoubleToString(tp1, _Digits));
   ObjectSetInteger(0, tp1_lbl, OBJPROP_COLOR, Col_TP1);
   ObjectSetInteger(0, tp1_lbl, OBJPROP_FONTSIZE, 8);
   ObjectSetInteger(0, tp1_lbl, OBJPROP_SELECTABLE, false);

   //--- TP2 line
   string tp2_name = prefix + "TP2";
   ObjectCreate(0, tp2_name, OBJ_HLINE, 0, current_time, tp2);
   ObjectSetInteger(0, tp2_name, OBJPROP_COLOR, Col_TP2);
   ObjectSetInteger(0, tp2_name, OBJPROP_STYLE, STYLE_DASH);
   ObjectSetInteger(0, tp2_name, OBJPROP_WIDTH, 1);
   ObjectSetString(0, tp2_name, OBJPROP_TEXT, "TP2");
   ObjectSetInteger(0, tp2_name, OBJPROP_SELECTABLE, false);

   //--- TP2 label
   string tp2_lbl = prefix + "TP2_LBL";
   ObjectCreate(0, tp2_lbl, OBJ_TEXT, 0, current_time, tp2);
   ObjectSetString(0, tp2_lbl, OBJPROP_TEXT,
                   "TP2 (1:" + DoubleToString(TP2_RR, 0) + "): " + DoubleToString(tp2, _Digits));
   ObjectSetInteger(0, tp2_lbl, OBJPROP_COLOR, Col_TP2);
   ObjectSetInteger(0, tp2_lbl, OBJPROP_FONTSIZE, 8);
   ObjectSetInteger(0, tp2_lbl, OBJPROP_SELECTABLE, false);

   //--- Info box
   string info_name = prefix + "INFO";
   ObjectCreate(0, info_name, OBJ_TEXT, 0,
                current_time, setup_type == 1 ? entry + atr * 2 : entry - atr * 2);
   string dir = setup_type == 1 ? "LONG" : "SHORT";
   ObjectSetString(0, info_name, OBJPROP_TEXT,
                   "SILVER BULLET " + dir + "\n" +
                   "FVG: " + DoubleToString(fvg_low, _Digits) + " - " + DoubleToString(fvg_high, _Digits) + "\n" +
                   "Entry: " + DoubleToString(entry, _Digits) + "\n" +
                   "SL: " + DoubleToString(sl, _Digits) + "\n" +
                   "TP1: " + DoubleToString(tp1, _Digits) + "\n" +
                   "TP2: " + DoubleToString(tp2, _Digits));
   ObjectSetInteger(0, info_name, OBJPROP_COLOR,
                    setup_type == 1 ? Col_Setup_Bull : Col_Setup_Bear);
   ObjectSetInteger(0, info_name, OBJPROP_FONTSIZE, 9);
   ObjectSetInteger(0, info_name, OBJPROP_ANCHOR, ANCHOR_CENTER);
   ObjectSetInteger(0, info_name, OBJPROP_SELECTABLE, false);
}

//+------------------------------------------------------------------+
//| Fire alert when Silver Bullet setup triggers                    |
//+------------------------------------------------------------------+
void FireAlert(datetime alert_time, double price)
{
   if(alert_time == g_last_alert_time) return;
   g_last_alert_time = alert_time;

   string msg = StringFormat("SILVER BULLET SETUP @ %s | Price: %s | %s",
                             TimeToString(alert_time, TIME_DATE | TIME_MINUTES),
                             DoubleToString(price, _Digits),
                             _Symbol);

   if(Enable_Alerts && Enable_Popup)
      Alert(msg);

   if(Enable_Alerts && Enable_Sound)
      PlaySound(Alert_Sound);

   if(Enable_Alerts && Enable_Push)
      SendNotification(msg);

   Print(msg);
}

//+------------------------------------------------------------------+
//| Clean all indicator objects                                      |
//+------------------------------------------------------------------+
void CleanObjects()
{
   ObjectsDeleteAll(0, "SB_");
   ObjectsDeleteAll(0, "FVG_");
}

//+------------------------------------------------------------------+
//| Deinitialization                                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   CleanObjects();

   IndicatorRelease(g_ema_fast_handle);
   IndicatorRelease(g_ema_slow_handle);
   IndicatorRelease(g_atr_handle);
}
//+------------------------------------------------------------------+
