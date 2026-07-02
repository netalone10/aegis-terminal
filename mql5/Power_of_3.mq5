//+------------------------------------------------------------------+
//|                                              Power_of_3.mq5      |
//|                              ICT Power of 3 Pattern Indicator      |
//|                              Detects A-M-D daily candle structure   |
//+------------------------------------------------------------------+
#property copyright "Aegis Terminal"
#property link      ""
#property version   "1.00"
#property strict
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots 0

//+------------------------------------------------------------------+
//| Input Parameters                                                   |
//+------------------------------------------------------------------+
input int      Accumulation_Period    = 4;           // Accumulation period (hours)
input double   Accumulation_Threshold = 0.3;         // Accumulation threshold (ATR multiple)
input int      Kill_Zone_Buffer       = 5;           // Kill zone buffer (pips from prev day H/L)
input int      ATR_Period             = 14;          // ATR period for thresholds
input bool     Show_Daily_Rectangle   = true;        // Show daily range rectangle
input bool     Show_Kill_Zone_Lines   = true;        // Show kill zone dashed lines
input bool     Show_Phase_Labels      = true;        // Show A/M/D phase labels
input bool     Show_Pattern_Label     = true;        // Show PO3 Bullish/Bearish label
input bool     Show_Manip_Arrow       = true;        // Show manipulation swing arrow

// Colors
input color    Color_Accumulation     = clrDodgerBlue;   // Accumulation color
input color    Color_Manipulation     = clrRed;           // Manipulation color
input color    Color_Distribution     = clrLimeGreen;     // Distribution color
input color    Color_Kill_Zone        = clrOrangeRed;     // Kill zone line color
input color    Color_Daily_Rect       = clrDarkSlateGray; // Daily rectangle color
input color    Color_Pattern_Label    = clrYellow;        // Pattern label color

input int      Label_Size             = 10;          // Label font size
input int      Pattern_Label_Size     = 12;          // Pattern label font size

//+------------------------------------------------------------------+
//| State Enum                                                         |
//+------------------------------------------------------------------+
enum ENUM_PO3_STATE
{
   STATE_IDLE            = 0,  // No pattern
   STATE_ACCUMULATION    = 1,  // Monitoring accumulation
   STATE_MANIPULATION    = 2,  // Watching for sweep
   STATE_DISTRIBUTION    = 3,  // Confirming distribution
   STATE_COMPLETE        = 4   // Pattern complete
};

//+------------------------------------------------------------------+
//| Global Variables                                                   |
//+------------------------------------------------------------------+
ENUM_PO3_STATE  g_state            = STATE_IDLE;
datetime        g_currentDay       = 0;
datetime        g_accumStart       = 0;
datetime        g_accumEnd         = 0;
datetime        g_manipTime        = 0;
datetime        g_distribStartTime = 0;
datetime        g_distribEndTime   = 0;

double          g_dailyOpen        = 0;
double          g_dailyHigh        = 0;
double          g_dailyLow         = 0;
double          g_dailyClose       = 0;

double          g_prevDayHigh      = 0;
double          g_prevDayLow       = 0;

double          g_manipHigh        = 0;
double          g_manipLow         = 0;
double          g_manipPrice       = 0;
bool            g_manipSweptHigh   = false;
bool            g_manipSweptLow    = false;
bool            g_isBullish        = false;

int             g_accumCandleCount = 0;
double          g_accumRange       = 0;

int             g_h1Handle         = INVALID_HANDLE;
int             g_atrHandle        = INVALID_HANDLE;

double          g_pipValue         = 0;

//+------------------------------------------------------------------+
//| Custom indicator initialization function                           |
//+------------------------------------------------------------------+
int OnInit()
{
   // Determine pip value based on symbol
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickSize == 0) tickSize = Point();

   if(_Digits == 3 || _Digits == 5)
      g_pipValue = tickSize * 10;
   else
      g_pipValue = tickSize;

   // Create handles
   g_h1Handle = iATR(_Symbol, PERIOD_H1, ATR_Period);
   g_atrHandle = iATR(_Symbol, PERIOD_D1, ATR_Period);

   if(g_h1Handle == INVALID_HANDLE || g_atrHandle == INVALID_HANDLE)
   {
      Print("Failed to create indicator handles");
      return(INIT_FAILED);
   }

   g_state = STATE_IDLE;
   g_currentDay = 0;

   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Custom indicator deinitialization function                         |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(g_h1Handle != INVALID_HANDLE)
      IndicatorRelease(g_h1Handle);
   if(g_atrHandle != INVALID_HANDLE)
      IndicatorRelease(g_atrHandle);

   // Clean up drawn objects
   ObjectsDeleteAll(0, "PO3_");
}

//+------------------------------------------------------------------+
//| Get start of day (midnight server time)                           |
//+------------------------------------------------------------------+
datetime GetDayStart(datetime dt)
{
   MqlDateTime mdt;
   TimeToStruct(dt, mdt);
   mdt.hour = 0;
   mdt.min = 0;
   mdt.sec = 0;
   return(StructToTime(mdt));
}

//+------------------------------------------------------------------+
//| Get H1 bar index for a given datetime                             |
//+------------------------------------------------------------------+
int GetH1BarIndex(datetime time)
{
   datetime h1Times[];
   if(CopyTime(_Symbol, PERIOD_H1, 0, 500, h1Times) <= 0)
      return -1;

   for(int i = ArraySize(h1Times) - 1; i >= 0; i--)
   {
      if(h1Times[i] == time)
         return i;
   }
   return -1;
}

//+------------------------------------------------------------------+
//| Get previous trading day high and low                              |
//+------------------------------------------------------------------+
bool GetPreviousDayHL(datetime dayStart, double &prevHigh, double &prevLow)
{
   MqlDateTime mdt;
   TimeToStruct(dayStart, mdt);

   // Find previous day bars on D1
   datetime prevDayEnd = dayStart - 1;
   datetime prevDayStart;

   mdt.day--;
   if(mdt.day < 1)
   {
      mdt.month--;
      if(mdt.month < 1) { mdt.year--; mdt.month = 12; }
      // Approximate - use day 28 for simplicity
      mdt.day = 28;
   }
   prevDayStart = StructToTime(mdt);

   MqlRates rates[];
   int copied = CopyRates(_Symbol, PERIOD_D1, prevDayStart, 2, rates);
   if(copied < 2)
   {
      // Try to get the day before current
      copied = CopyRates(_Symbol, PERIOD_D1, 1, 1, rates);
      if(copied < 1) return false;
   }

   prevHigh = rates[copied - 1].high;
   prevLow = rates[copied - 1].low;
   return true;
}

//+------------------------------------------------------------------+
//| Get ATR value                                                      |
//+------------------------------------------------------------------+
double GetATR(int handle, int shift = 0)
{
   double buf[];
   if(CopyBuffer(handle, 0, shift, 1, buf) <= 0)
      return 0;
   return buf[0];
}

//+------------------------------------------------------------------+
//| Create text label object                                           |
//+------------------------------------------------------------------+
void CreateLabel(string name, datetime time, double price, string text,
                 color clr, int size = 10, int corner = CORNER_LOWER_LEFT)
{
   string objName = "PO3_" + name;
   if(ObjectFind(0, objName) < 0)
   {
      ObjectCreate(0, objName, OBJ_TEXT, 0, time, price);
      ObjectSetString(0, objName, OBJPROP_TEXT, text);
      ObjectSetInteger(0, objName, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, objName, OBJPROP_FONTSIZE, size);
      ObjectSetString(0, objName, OBJPROP_FONT, "Arial Bold");
      ObjectSetInteger(0, objName, OBJPROP_ANCHOR, ANCHOR_CENTER);
   }
   else
   {
      ObjectSetString(0, objName, OBJPROP_TEXT, text);
      ObjectSetInteger(0, objName, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, objName, OBJPROP_FONTSIZE, size);
   }
}

//+------------------------------------------------------------------+
//| Create horizontal dashed line                                       |
//+------------------------------------------------------------------+
void CreateHLine(string name, double price, color clr, int width = 1,
                 ENUM_LINE_STYLE style = STYLE_DASH)
{
   string objName = "PO3_" + name;
   if(ObjectFind(0, objName) < 0)
   {
      ObjectCreate(0, objName, OBJ_HLINE, 0, 0, price);
      ObjectSetInteger(0, objName, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, objName, OBJPROP_WIDTH, width);
      ObjectSetInteger(0, objName, OBJPROP_STYLE, style);
      ObjectSetInteger(0, objName, OBJPROP_BACK, true);
   }
   else
   {
      ObjectSetDouble(0, objName, OBJPROP_PRICE, price);
      ObjectSetInteger(0, objName, OBJPROP_COLOR, clr);
   }
}

//+------------------------------------------------------------------+
//| Create rectangle                                                   |
//+------------------------------------------------------------------+
void CreateRectangle(string name, datetime t1, double p1, datetime t2, double p2,
                     color clr, bool fill = true)
{
   string objName = "PO3_" + name;
   if(ObjectFind(0, objName) < 0)
   {
      ObjectCreate(0, objName, OBJ_RECTANGLE, 0, t1, p1, t2, p2);
      ObjectSetInteger(0, objName, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, objName, OBJPROP_FILL, fill);
      ObjectSetInteger(0, objName, OBJPROP_BACK, true);
      ObjectSetInteger(0, objName, OBJPROP_WIDTH, 1);
      ObjectSetInteger(0, objName, OBJPROP_STYLE, STYLE_DOT);
   }
   else
   {
      ObjectSetInteger(0, objName, OBJPROP_TIME, 0, t1);
      ObjectSetDouble(0, objName, OBJPROP_PRICE, 0, p1);
      ObjectSetInteger(0, objName, OBJPROP_TIME, 1, t2);
      ObjectSetDouble(0, objName, OBJPROP_PRICE, 1, p2);
   }
}

//+------------------------------------------------------------------+
//| Create arrow                                                       |
//+------------------------------------------------------------------+
void CreateArrow(string name, datetime time, double price, bool up, color clr)
{
   string objName = "PO3_" + name;
   if(ObjectFind(0, objName) < 0)
   {
      ObjectCreate(0, objName, OBJ_ARROW, 0, time, price);
      ObjectSetInteger(0, objName, OBJPROP_ARROWCODE, up ? 233 : 234);
      ObjectSetInteger(0, objName, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, objName, OBJPROP_WIDTH, 2);
   }
   else
   {
      ObjectSetInteger(0, objName, OBJPROP_TIME, time);
      ObjectSetDouble(0, objName, OBJPROP_PRICE, price);
   }
}

//+------------------------------------------------------------------+
//| Reset all state for new day                                        |
//+------------------------------------------------------------------+
void ResetState()
{
   g_state            = STATE_IDLE;
   g_accumStart       = 0;
   g_accumEnd         = 0;
   g_manipTime        = 0;
   g_distribStartTime = 0;
   g_distribEndTime   = 0;
   g_dailyOpen        = 0;
   g_dailyHigh        = 0;
   g_dailyLow         = 0;
   g_dailyClose       = 0;
   g_manipHigh        = 0;
   g_manipLow         = 0;
   g_manipPrice       = 0;
   g_manipSweptHigh   = false;
   g_manipSweptLow    = false;
   g_isBullish        = false;
   g_accumCandleCount = 0;
   g_accumRange       = 0;
}

//+------------------------------------------------------------------+
//| Delete previous day objects                                        |
//+------------------------------------------------------------------+
void CleanOldObjects()
{
   string prefix = "PO3_";
   int total = ObjectsTotal(0, 0, -1);
   for(int i = total - 1; i >= 0; i--)
   {
      string name = ObjectName(0, i, 0, -1);
      if(StringFind(name, prefix) == 0)
      {
         datetime objTime = (datetime)ObjectGetInteger(0, name, OBJPROP_TIME, 0);
         if(objTime > 0 && objTime < TimeCurrent() - PeriodSeconds(PERIOD_D1) * 2)
            ObjectDelete(0, name);
      }
   }
}

//+------------------------------------------------------------------+
//| Main processing: analyze current day's PO3                        |
//+------------------------------------------------------------------+
void AnalyzeCurrentDay()
{
   MqlRates d1Rates[];
   if(CopyRates(_Symbol, PERIOD_D1, 0, 3, d1Rates) < 2)
      return;

   datetime dayStart = GetDayStart(TimeCurrent());

   // Check for new day
   if(dayStart != g_currentDay)
   {
      g_currentDay = dayStart;
      ResetState();
      CleanOldObjects();

      // Get daily candle data
      MqlRates today[];
      if(CopyRates(_Symbol, PERIOD_D1, 0, 1, today) < 1)
         return;

      g_dailyOpen  = today[0].open;
      g_dailyHigh  = today[0].high;
      g_dailyLow   = today[0].low;
      g_dailyClose = today[0].close;

      // Get previous day H/L
      if(!GetPreviousDayHL(dayStart, g_prevDayHigh, g_prevDayLow))
         return;

      g_state = STATE_ACCUMULATION;
      g_accumStart = dayStart;
      g_accumEnd = dayStart + Accumulation_Period * 3600;

      Print("PO3: New day detected. State -> ACCUMULATION");
      Print("PO3: Daily Open=", g_dailyOpen,
            " PrevHigh=", g_prevDayHigh,
            " PrevLow=", g_prevDayLow);

      // Draw kill zone lines
      if(Show_Kill_Zone_Lines)
      {
         CreateHLine("KZ_High", g_prevDayHigh, Color_Kill_Zone, 1, STYLE_DASHDOT);
         CreateHLine("KZ_Low", g_prevDayLow, Color_Kill_Zone, 1, STYLE_DASHDOT);
      }
   }

   // Get current price
   MqlRates currentBar[];
   if(CopyRates(_Symbol, _Period, 0, 1, currentBar) < 1)
      return;

   double currentPrice = currentBar[0].close;
   datetime currentTime = currentBar[0].time;

   // Get H1 ATR for accumulation threshold
   double atr = GetATR(g_h1Handle, 0);
   if(atr == 0) atr = GetATR(g_atrHandle, 1);

   double accumThreshold = g_dailyOpen + Accumulation_Threshold * atr;

   // State machine
   switch(g_state)
   {
      case STATE_ACCUMULATION:
         ProcessAccumulation(currentTime, currentPrice, atr);
         break;

      case STATE_MANIPULATION:
         ProcessManipulation(currentTime, currentPrice);
         break;

      case STATE_DISTRIBUTION:
         ProcessDistribution(currentTime, currentPrice);
         break;

      case STATE_COMPLETE:
         // Already complete, nothing to do
         break;

      default:
         break;
   }

   // Update daily range rectangle
   if(Show_Daily_Rectangle && g_dailyOpen > 0)
   {
      datetime dayEnd = dayStart + 24 * 3600;
      CreateRectangle("DailyRange", dayStart, g_dailyHigh, dayEnd, g_dailyLow,
                      Color_Daily_Rect);
   }
}

//+------------------------------------------------------------------+
//| Process Accumulation phase                                         |
//+------------------------------------------------------------------+
void ProcessAccumulation(datetime currentTime, double currentPrice, double atr)
{
   // Check if we're still in accumulation window
   if(currentTime < g_accumEnd)
   {
      // Check if price stays within threshold
      double devHigh = MathAbs(currentPrice - g_dailyOpen);
      double devLow  = MathAbs(currentPrice - g_dailyLow);

      g_accumCandleCount++;

      // Track max deviation from open during accumulation
      if(devHigh > g_accumRange) g_accumRange = devHigh;

      if(Show_Phase_Label)
      {
         CreateLabel("Phase_A", g_accumStart, g_dailyHigh + atr * 0.3,
                     "A", Color_Accumulation, Label_Size);
      }
   }
   else
   {
      // Accumulation window ended - transition to manipulation
      if(Show_Phase_Label)
      {
         CreateLabel("Phase_A", g_accumStart, g_dailyHigh + atr * 0.3,
                     "A", Color_Accumulation, Label_Size);
      }

      // Mark accumulation zone with rectangle
      double accumHigh = g_dailyOpen + g_accumRange;
      double accumLow  = g_dailyOpen - g_accumRange;
      if(accumLow < g_dailyLow || g_dailyLow > g_dailyOpen)
         accumLow = g_dailyLow - 0.001;

      CreateRectangle("AccumZone", g_accumStart, MathMax(g_dailyOpen, accumHigh),
                      g_accumEnd, MathMin(g_dailyOpen, accumLow),
                      clrDodgerBlue);

      g_state = STATE_MANIPULATION;
      g_manipHigh = 0;
      g_manipLow  = 999999;
      Print("PO3: Accumulation complete. State -> MANIPULATION");
   }
}

//+------------------------------------------------------------------+
//| Process Manipulation phase                                         |
//+------------------------------------------------------------------+
void ProcessManipulation(datetime currentTime, double currentPrice)
{
   // Track manipulation highs and lows
   if(currentPrice > g_manipHigh) g_manipHigh = currentPrice;
   if(currentPrice < g_manipLow)  g_manipLow  = currentPrice;

   double bufferPips = Kill_Zone_Buffer * g_pipValue;

   // Check if price swept previous day high
   if(!g_manipSweptHigh && currentPrice >= g_prevDayHigh - bufferPips)
   {
      g_manipSweptHigh = true;
      g_manipPrice = currentPrice;
      g_manipTime = currentTime;
      Print("PO3: Manipulation swept HIGH at ", currentPrice,
            " (PrevHigh=", g_prevDayHigh, ")");
   }

   // Check if price swept previous day low
   if(!g_manipSweptLow && currentPrice <= g_prevDayLow + bufferPips)
   {
      g_manipSweptLow = true;
      g_manipPrice = currentPrice;
      g_manipTime = currentTime;
      Print("PO3: Manipulation swept LOW at ", currentPrice,
            " (PrevLow=", g_prevDayLow, ")");
   }

   if(Show_Phase_Label)
   {
      double atr = GetATR(g_h1Handle, 0);
      if(atr == 0) atr = 10 * _Point;
      CreateLabel("Phase_M", g_accumEnd, g_dailyHigh + atr * 0.3,
                  "M", Color_Manipulation, Label_Size);
   }

   // Manipulation detected - check for transition to distribution
   if(g_manipSweptHigh || g_manipSweptLow)
   {
      // Calculate if we've moved enough to confirm distribution
      double distribDistance = 0;

      if(g_manipSweptHigh && g_manipSweptLow)
      {
         // Both swept - check which direction the last sweep went
         if(g_manipTime > 0)
         {
            // Use the most recent sweep direction
            if(currentPrice < g_manipPrice)
            {
               // Bearish: swept high, now moving down
               distribDistance = g_manipPrice - currentPrice;
               g_isBullish = false;
            }
            else
            {
               // Bullish: swept low, now moving up
               distribDistance = currentPrice - g_manipPrice;
               g_isBullish = true;
            }
         }
      }
      else if(g_manipSweptHigh)
      {
         // Swept high - bearish PO3
         distribDistance = g_manipPrice - currentPrice;
         g_isBullish = false;
      }
      else if(g_manipSweptLow)
      {
         // Swept low - bullish PO3
         distribDistance = currentPrice - g_manipPrice;
         g_isBullish = true;
      }

      // Need significant move to confirm distribution (at least 0.5x ATR)
      double atr = GetATR(g_h1Handle, 0);
      if(atr == 0) atr = GetATR(g_atrHandle, 1);

      double minDistribMove = atr * 0.5;

      if(distribDistance >= minDistribMove)
      {
         g_state = STATE_DISTRIBUTION;
         g_distribStartTime = currentTime;
         Print("PO3: Manipulation complete. Direction: ",
               (g_isBullish ? "BULLISH" : "BEARISH"),
               ". State -> DISTRIBUTION");

         // Draw manipulation arrow
         if(Show_Manip_Arrow && g_manipTime > 0)
         {
            CreateArrow("ManipArrow", g_manipTime, g_manipPrice,
                        g_manipSweptLow, clrRed);
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Process Distribution phase                                         |
//+------------------------------------------------------------------+
void ProcessDistribution(datetime currentTime, double currentPrice)
{
   g_distribEndTime = currentTime;

   if(Show_Phase_Label)
   {
      double atr = GetATR(g_h1Handle, 0);
      if(atr == 0) atr = 10 * _Point;
      CreateLabel("Phase_D", g_distribStartTime, g_dailyHigh + atr * 0.3,
                  "D", Color_Distribution, Label_Size);
   }

   // Mark distribution zone
   if(g_isBullish)
   {
      CreateRectangle("DistribZone", g_manipTime, g_manipPrice,
                      currentTime, currentPrice, clrLimeGreen);
   }
   else
   {
      CreateRectangle("DistribZone", g_manipTime, g_manipPrice,
                      currentTime, currentPrice, clrLimeGreen);
   }

   // Show pattern label
   if(Show_Pattern_Label)
   {
      string patternLabel = g_isBullish ? "PO3 Bullish" : "PO3 Bearish";
      CreateLabel("PatternLabel", g_manipTime, g_manipPrice,
                  patternLabel, Color_Pattern_Label, Pattern_Label_Size);

      // Arrow indicating direction
      CreateArrow("PatternArrow", g_distribStartTime, currentPrice,
                  g_isBullish, Color_Pattern_Label);
   }

   // Check if day is complete or distribution confirmed enough
   MqlRates currentBar[];
   if(CopyRates(_Symbol, _Period, 0, 1, currentBar) < 1)
      return;

   datetime dayStart = GetDayStart(currentTime);
   datetime dayEnd = dayStart + 24 * 3600;

   // Complete when day ends or distribution is well-established
   if(currentTime >= dayEnd - PeriodSeconds(PERIOD_H1))
   {
      g_state = STATE_COMPLETE;
      Print("PO3: Pattern complete. ",
            (g_isBullish ? "Bullish" : "Bearish"),
            " PO3 confirmed.");
   }
}

//+------------------------------------------------------------------+
//| Alternative: Analyze completed daily candles for PO3               |
//+------------------------------------------------------------------+
void AnalyzeCompletedDays()
{
   MqlRates rates[];
   if(CopyRates(_Symbol, PERIOD_D1, 1, 5, rates) < 3)
      return;

   // Analyze the most recent completed day
   int idx = 1; // Previous completed day
   double dayOpen  = rates[idx].open;
   double dayHigh  = rates[idx].high;
   double dayLow   = rates[idx].low;
   double dayClose = rates[idx].close;

   datetime dayTime = rates[idx].time;
   datetime dayStart = GetDayStart(dayTime);

   // Previous day's H/L
   if(idx + 1 < ArraySize(rates))
   {
      double prevHigh = rates[idx + 1].high;
      double prevLow  = rates[idx + 1].low;

      // Get H1 bars for this day
      MqlRates h1Rates[];
      datetime h1Start = dayStart;
      datetime h1End = dayStart + 24 * 3600;

      if(CopyRates(_Symbol, PERIOD_H1, h1Start, 24, h1Rates) < 20)
         return;

      double atr = 0;
      double atrBuf[];
      if(CopyBuffer(g_h1Handle, 0, 0, 1, atrBuf) > 0)
         atr = atrBuf[0];

      // Phase 1: Accumulation
      int accumEndIdx = MathMin(Accumulation_Period, ArraySize(h1Rates));
      double accumMaxDev = 0;
      datetime accumStart = h1Rates[0].time;
      datetime accumEndT = h1Rates[accumEndIdx - 1].time + PeriodSeconds(PERIOD_H1);

      for(int i = 0; i < accumEndIdx; i++)
      {
         double dev = MathAbs(h1Rates[i].open - dayOpen);
         double devClose = MathAbs(h1Rates[i].close - dayOpen);
         if(dev > accumMaxDev) accumMaxDev = dev;
         if(devClose > accumMaxDev) accumMaxDev = devClose;
      }

      bool withinThreshold = accumMaxDev <= Accumulation_Threshold * atr;
      if(!withinThreshold) return;

      // Phase 2: Manipulation
      int manipStartIdx = accumEndIdx;
      bool sweptHigh = false;
      bool sweptLow = false;
      int manipIdx = -1;

      for(int i = manipStartIdx; i < ArraySize(h1Rates); i++)
      {
         if(h1Rates[i].high >= prevHigh)
         {
            sweptHigh = true;
            if(manipIdx < 0) manipIdx = i;
         }
         if(h1Rates[i].low <= prevLow)
         {
            sweptLow = true;
            if(manipIdx < 0) manipIdx = i;
         }
      }

      if(!sweptHigh && !sweptLow) return;

      // Phase 3: Distribution
      bool distributionConfirmed = false;
      if(sweptHigh && dayClose < dayOpen) distributionConfirmed = true;
      if(sweptLow && dayClose > dayOpen) distributionConfirmed = true;

      if(!distributionConfirmed) return;

      // Pattern confirmed! Draw on chart
      bool bullish = sweptLow && dayClose > dayOpen;

      string prefix = "PO3_HIST_" + IntegerToString((int)dayStart);

      if(Show_Kill_Zone_Lines)
      {
         CreateHLine(prefix + "_KZ_H", prevHigh, Color_Kill_Zone, 1, STYLE_DASHDOT);
         CreateHLine(prefix + "_KZ_L", prevLow, Color_Kill_Zone, 1, STYLE_DASHDOT);
      }

      if(Show_Phase_Label)
      {
         CreateLabel(prefix + "_A", accumStart, dayHigh + atr * 0.5,
                     "A", Color_Accumulation, Label_Size);
         if(manipIdx >= 0)
         {
            CreateLabel(prefix + "_M", h1Rates[manipIdx].time, dayHigh + atr * 0.5,
                        "M", Color_Manipulation, Label_Size);
         }
         CreateLabel(prefix + "_D", h1Rates[MathMin(manipStartIdx + 1, ArraySize(h1Rates) - 1)].time,
                     dayHigh + atr * 0.5, "D", Color_Distribution, Label_Size);
      }

      if(Show_Daily_Rectangle)
      {
         CreateRectangle(prefix + "_Rect", dayStart, dayHigh,
                         dayStart + 24 * 3600, dayLow, Color_Daily_Rect);
      }

      if(Show_Manip_Arrow && manipIdx >= 0)
      {
         double arrowPrice = sweptHigh ? prevHigh + atr * 0.2 : prevLow - atr * 0.2;
         CreateArrow(prefix + "_Arr", h1Rates[manipIdx].time, arrowPrice,
                     sweptLow, Color_Manipulation);
      }

      if(Show_Pattern_Label)
      {
         string label = bullish ? "PO3 Bullish" : "PO3 Bearish";
         double labelPrice = dayHigh + atr;
         datetime labelTime = dayStart + 12 * 3600;
         CreateLabel(prefix + "_Label", labelTime, labelPrice,
                     label, Color_Pattern_Label, Pattern_Label_Size);
      }
   }
}

//+------------------------------------------------------------------+
//| OnCalculate - Main entry point                                     |
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
   // Only process new ticks
   if(rates_total != prev_calculated)
   {
      // Analyze current day's live PO3
      AnalyzeCurrentDay();

      // Also analyze recently completed days for PO3 patterns
      AnalyzeCompletedDays();
   }

   return(rates_total);
}

//+------------------------------------------------------------------+
//| OnTimer for periodic updates (optional)                            |
//+------------------------------------------------------------------+
void OnTimer()
{
   // Periodic refresh
   ChartRedraw(0);
}
//+------------------------------------------------------------------+