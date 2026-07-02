//+------------------------------------------------------------------+
//|                                          AMD_Cycle_Label.mq5      |
//|                              ICT Accumulation-Manipulation-        |
//|                              Distribution Cycle Labeler            |
//+------------------------------------------------------------------+
#property copyright "Aegis Terminal"
#property link      ""
#property version   "1.00"
#property strict
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

//--- Input parameters: Session times (WIB = UTC+7)
input int    Asia_Start       = 7;       // Asia session start hour (WIB)
input int    Asia_End         = 11;      // Asia session end hour (WIB)
input int    London_Start     = 13;      // London session start hour (WIB)
input int    London_End       = 17;      // London session end hour (WIB)
input int    NY_Start         = 19;      // NY session start hour (WIB)
input int    NY_End           = 23;      // NY session end hour (WIB)

//--- Input parameters: AMD detection
input int    Accumulation_Period     = 6;    // Min candles for accumulation
input double Manipulation_Threshold  = 0.3;  // Min breakout as ATR multiplier
input int    ATR_Period              = 14;   // ATR period for threshold
input double Range_Tightness         = 0.5;  // Max range as ATR fraction for accum

//--- Input parameters: Colors
input color  Color_Accumulation  = clrDodgerBlue;   // A label color
input color  Color_Manipulation  = clrRed;           // M label color
input color  Color_Distribution  = clrLimeGreen;     // D label color
input color  Color_AccumRect     = clrDodgerBlue;    // Accumulation rectangle
input color  Color_ManiRect      = clrRed;            // Manipulation rectangle
input color  Color_DistRect      = clrLimeGreen;      // Distribution rectangle
input color  Color_PatternBull   = clrCyan;           // Bullish pattern label
input color  Color_PatternBear   = clrOrangeRed;      // Bearish pattern label

//--- Input parameters: Display
input int    Label_Font_Size    = 8;      // Label font size
input bool   Show_Rectangles    = true;   // Show session range rectangles
input bool   Show_Target_Lines  = true;   // Show distribution target lines
input bool   Show_Pattern_Label = true;   // Show pattern type label
input ENUM_ANCHOR_POINT Label_Anchor = ANCHOR_LOWER; // Label anchor point

//--- Enumerations
enum ENUM_AMD_STATE
{
   AMD_IDLE        = 0,  // Idle (outside session)
   AMD_ACCUMULATING = 1, // Accumulation phase
   AMD_MANIPULATING = 2, // Manipulation phase
   AMD_DISTRIBUTING = 3  // Distribution phase
};

enum ENUM_SESSION_TYPE
{
   SESSION_NONE   = 0,   // No session
   SESSION_ASIA   = 1,   // Asia session
   SESSION_LONDON = 2,   // London session
   SESSION_NY     = 3    // NY session
};

enum ENUM_AMD_PATTERN
{
   PATTERN_NONE     = 0, // No pattern
   PATTERN_BULLISH  = 1, // Bullish AMD
   PATTERN_BEARISH  = 2  // Bearish AMD
};

//--- Global variables
double   g_atrBuffer[];
double   g_accumHigh;
double   g_accumLow;
double   g_accumStartPrice;
datetime g_accumStartTime;
datetime g_sessionStartTime;
int      g_accumCandleCount;
ENUM_AMD_STATE    g_state;
ENUM_SESSION_TYPE g_session;
ENUM_AMD_PATTERN  g_pattern;
double   g_manipSwingHigh;
double   g_manipSwingLow;
datetime g_manipSwingTime;
bool     g_manipSweptLow;
bool     g_manipSweptHigh;
bool     g_manipCompleted;
bool     g_distStarted;
double   g_distTarget;
datetime g_lastProcessedBar;

//--- Object name prefix
string   g_prefix = "AMD_";

//+------------------------------------------------------------------+
//| Custom indicator initialization function                          |
//+------------------------------------------------------------------+
int OnInit()
{
   //--- Initialize state
   g_state          = AMD_IDLE;
   g_session        = SESSION_NONE;
   g_pattern        = PATTERN_NONE;
   g_accumCandleCount = 0;
   g_manipSwingHigh = 0;
   g_manipSwingLow  = DBL_MAX;
   g_manipSweptLow  = false;
   g_manipSweptHigh = false;
   g_manipCompleted = false;
   g_distStarted    = false;
   g_distTarget     = 0;
   g_lastProcessedBar = 0;

   //--- Create ATR buffer (only for calculation, not displayed)
   ArrayResize(g_atrBuffer, 0);

   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Custom indicator deinitialization function                        |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   //--- Clean up all drawn objects
   ObjectsDeleteAll(0, g_prefix);
}

//+------------------------------------------------------------------+
//| Get current hour in WIB (UTC+7) from bar time                     |
//+------------------------------------------------------------------+
int GetWIBHour(datetime barTime)
{
   MqlDateTime dt;
   TimeToStruct(barTime, dt);
   // Convert from broker time to WIB (UTC+7)
   // Assuming broker server is UTC+0; adjust if needed
   int wibHour = (dt.hour + 7) % 24;
   return wibHour;
}

//+------------------------------------------------------------------+
//| Determine which session a bar belongs to                          |
//+------------------------------------------------------------------+
ENUM_SESSION_TYPE GetSession(datetime barTime)
{
   int hour = GetWIBHour(barTime);

   // Asia: 07:00-11:00 WIB
   if(hour >= Asia_Start && hour < Asia_End)
      return SESSION_ASIA;

   // London: 13:00-17:00 WIB
   if(hour >= London_Start && hour < London_End)
      return SESSION_LONDON;

   // NY: 19:00-23:00 WIB
   if(hour >= NY_Start && hour < NY_End)
      return SESSION_NY;

   return SESSION_NONE;
}

//+------------------------------------------------------------------+
//| Check if a new session has started                                |
//+------------------------------------------------------------------+
bool IsNewSession(ENUM_SESSION_TYPE current, ENUM_SESSION_TYPE previous)
{
   if(current != previous && current != SESSION_NONE)
      return true;
   return false;
}

//+------------------------------------------------------------------+
//| Calculate ATR manually from available data                        |
//+------------------------------------------------------------------+
double CalcATR(int period, int shift)
{
   if(period <= 0) return 0;
   double sum = 0;
   int counted = 0;
   for(int i = shift; i < shift + period && i < Bars(_Symbol, PERIOD_CURRENT); i++)
   {
      double high = iHigh(_Symbol, PERIOD_CURRENT, i);
      double low  = iLow(_Symbol, PERIOD_CURRENT, i);
      double close_prev = iClose(_Symbol, PERIOD_CURRENT, i + 1);
      if(close_prev > 0)
      {
         double tr = MathMax(high - low,
                      MathMax(MathAbs(high - close_prev),
                              MathAbs(low - close_prev)));
         sum += tr;
         counted++;
      }
   }
   return (counted > 0) ? sum / counted : 0;
}

//+------------------------------------------------------------------+
//| Create a text label on the chart                                  |
//+------------------------------------------------------------------+
void CreateLabel(string name, datetime time, double price,
                 string text, color clr, int fontSize = 0)
{
   if(fontSize == 0) fontSize = Label_Font_Size;
   string objName = g_prefix + name;

   if(ObjectFind(0, objName) < 0)
   {
      ObjectCreate(0, objName, OBJ_TEXT, 0, time, price);
      ObjectSetInteger(0, objName, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, objName, OBJPROP_FONTSIZE, fontSize);
      ObjectSetString(0, objName, OBJPROP_FONT, "Arial Bold");
      ObjectSetString(0, objName, OBJPROP_TEXT, text);
      ObjectSetInteger(0, objName, OBJPROP_ANCHOR, ANCHOR_CENTER);
      ObjectSetInteger(0, objName, OBJPROP_BACK, false);
   }
}

//+------------------------------------------------------------------+
//| Draw accumulation range rectangle                                 |
//+------------------------------------------------------------------+
void DrawAccumRect(datetime startTime, datetime endTime,
                   double high, double low, color clr)
{
   if(!Show_Rectangles) return;
   string objName = g_prefix + "AccumRect";

   if(ObjectFind(0, objName) < 0)
   {
      ObjectCreate(0, objName, OBJ_RECTANGLE, 0,
                   startTime, high, endTime, low);
      ObjectSetInteger(0, objName, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, objName, OBJPROP_STYLE, STYLE_DOT);
      ObjectSetInteger(0, objName, OBJPROP_WIDTH, 1);
      ObjectSetInteger(0, objName, OBJPROP_FILL, false);
      ObjectSetInteger(0, objName, OBJPROP_BACK, true);
      ObjectSetInteger(0, objName, OBJPROP_SELECTABLE, false);
   }
}

//+------------------------------------------------------------------+
//| Draw manipulation extension rectangle                             |
//+------------------------------------------------------------------+
void DrawManiRect(datetime startTime, datetime endTime,
                  double high, double low, color clr)
{
   if(!Show_Rectangles) return;
   string objName = g_prefix + "ManiRect";

   if(ObjectFind(0, objName) < 0)
   {
      ObjectCreate(0, objName, OBJ_RECTANGLE, 0,
                   startTime, high, endTime, low);
      ObjectSetInteger(0, objName, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, objName, OBJPROP_STYLE, STYLE_DASH);
      ObjectSetInteger(0, objName, OBJPROP_WIDTH, 1);
      ObjectSetInteger(0, objName, OBJPROP_FILL, false);
      ObjectSetInteger(0, objName, OBJPROP_BACK, true);
      ObjectSetInteger(0, objName, OBJPROP_SELECTABLE, false);
   }
}

//+------------------------------------------------------------------+
//| Draw distribution target line                                     |
//+------------------------------------------------------------------+
void DrawTargetLine(datetime time, double price, color clr)
{
   if(!Show_Target_Lines) return;
   string objName = g_prefix + "TargetLine";

   if(ObjectFind(0, objName) < 0)
   {
      ObjectCreate(0, objName, OBJ_TREND, 0, time, price,
                   time + PeriodSeconds(PERIOD_CURRENT) * 10, price);
      ObjectSetInteger(0, objName, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, objName, OBJPROP_STYLE, STYLE_DASHDOT);
      ObjectSetInteger(0, objName, OBJPROP_WIDTH, 1);
      ObjectSetInteger(0, objName, OBJPROP_RAY_RIGHT, true);
      ObjectSetInteger(0, objName, OBJPROP_BACK, true);
      ObjectSetInteger(0, objName, OBJPROP_SELECTABLE, false);
   }
}

//+------------------------------------------------------------------+
//| Draw pattern type label at session start                          |
//+------------------------------------------------------------------+
void DrawPatternLabel(ENUM_AMD_PATTERN pattern, datetime time, double price)
{
   if(!Show_Pattern_Label) return;
   if(pattern == PATTERN_NONE) return;

   string objName = g_prefix + "PatternLabel";
   string text = (pattern == PATTERN_BULLISH) ? "BULLISH AMD" : "BEARISH AMD";
   color clr  = (pattern == PATTERN_BULLISH) ? Color_PatternBull : Color_PatternBear;

   if(ObjectFind(0, objName) < 0)
   {
      ObjectCreate(0, objName, OBJ_TEXT, 0, time, price);
      ObjectSetInteger(0, objName, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, objName, OBJPROP_FONTSIZE, Label_Font_Size + 1);
      ObjectSetString(0, objName, OBJPROP_FONT, "Arial Bold");
      ObjectSetString(0, objName, OBJPROP_TEXT, text);
      ObjectSetInteger(0, objName, OBJPROP_ANCHOR, ANCHOR_CENTER);
      ObjectSetInteger(0, objName, OBJPROP_BACK, false);
   }
}

//+------------------------------------------------------------------+
//| Reset state for new session                                       |
//+------------------------------------------------------------------+
void ResetSessionState()
{
   g_accumHigh        = 0;
   g_accumLow         = DBL_MAX;
   g_accumStartPrice  = 0;
   g_accumStartTime   = 0;
   g_accumCandleCount = 0;
   g_manipSwingHigh   = 0;
   g_manipSwingLow    = DBL_MAX;
   g_manipSwingTime   = 0;
   g_manipSweptLow    = false;
   g_manipSweptHigh   = false;
   g_manipCompleted   = false;
   g_distStarted      = false;
   g_distTarget       = 0;
   g_pattern          = PATTERN_NONE;

   //--- Clean session objects
   ObjectsDeleteAll(0, g_prefix + "AccumRect");
   ObjectsDeleteAll(0, g_prefix + "ManiRect");
   ObjectsDeleteAll(0, g_prefix + "TargetLine");
   ObjectsDeleteAll(0, g_prefix + "PatternLabel");
}

//+------------------------------------------------------------------+
//| Place A label on candle                                           |
//+------------------------------------------------------------------+
void PlaceALabel(int bar, double high, double low)
{
   datetime time = iTime(_Symbol, PERIOD_CURRENT, bar);
   double price;
   if(Label_Anchor == ANCHOR_UPPER || Label_Anchor == ANCHOR_LOWER)
      price = (low + high) / 2.0;
   else
      price = high;

   // Alternate above/below for readability
   if(bar % 2 == 0)
      price = high + iATR(_Symbol, PERIOD_CURRENT, ATR_Period, bar) * 0.3;
   else
      price = low - iATR(_Symbol, PERIOD_CURRENT, ATR_Period, bar) * 0.3;

   string name = "A_" + TimeToString(time, TIME_MINUTES);
   CreateLabel(name, time, price, "A", Color_Accumulation);
}

//+------------------------------------------------------------------+
//| Place M label at manipulation swing point                         |
//+------------------------------------------------------------------+
void PlaceMLabel(int bar, double high, double low, bool sweptLow)
{
   datetime time = iTime(_Symbol, PERIOD_CURRENT, bar);
   double price;
   if(sweptLow)
      price = low - iATR(_Symbol, PERIOD_CURRENT, ATR_Period, bar) * 0.5;
   else
      price = high + iATR(_Symbol, PERIOD_CURRENT, ATR_Period, bar) * 0.5;

   string name = "M_" + TimeToString(time, TIME_MINUTES);
   CreateLabel(name, time, price, "M", Color_Manipulation, Label_Font_Size + 2);
}

//+------------------------------------------------------------------+
//| Place D label at distribution start                               |
//+------------------------------------------------------------------+
void PlaceDLabel(int bar, double high, double low, ENUM_AMD_PATTERN pat)
{
   datetime time = iTime(_Symbol, PERIOD_CURRENT, bar);
   double price;
   if(pat == PATTERN_BULLISH)
      price = high + iATR(_Symbol, PERIOD_CURRENT, ATR_Period, bar) * 0.5;
   else
      price = low - iATR(_Symbol, PERIOD_CURRENT, ATR_Period, bar) * 0.5;

   string name = "D_" + TimeToString(time, TIME_MINUTES);
   CreateLabel(name, time, price, "D", Color_Distribution, Label_Font_Size + 2);
}

//+------------------------------------------------------------------+
//| Check accumulation tightness                                      |
//+------------------------------------------------------------------+
bool IsTightRange(double rangeHigh, double rangeLow, double atr)
{
   if(atr <= 0) return false;
   double range = rangeHigh - rangeLow;
   return (range <= atr * Range_Tightness);
}

//+------------------------------------------------------------------+
//| Check manipulation breakout                                       |
//+------------------------------------------------------------------+
bool IsBreakout(double price, double high, double low, double atr)
{
   if(atr <= 0) return false;
   double threshold = atr * Manipulation_Threshold;

   // Price broke above accumulation high
   if(price > high + threshold)
      return true;

   // Price broke below accumulation low
   if(price < low - threshold)
      return true;

   return false;
}

//+------------------------------------------------------------------+
//| Core AMD state machine logic per bar                              |
//+------------------------------------------------------------------+
void ProcessBar(int bar)
{
   datetime barTime = iTime(_Symbol, PERIOD_CURRENT, bar);
   double   open    = iOpen(_Symbol, PERIOD_CURRENT, bar);
   double   high    = iHigh(_Symbol, PERIOD_CURRENT, bar);
   double   low     = iLow(_Symbol, PERIOD_CURRENT, bar);
   double   close   = iClose(_Symbol, PERIOD_CURRENT, bar);
   double   atr     = iATR(_Symbol, PERIOD_CURRENT, ATR_Period, bar);

   ENUM_SESSION_TYPE currentSession = GetSession(barTime);

   //--- Session boundary check
   if(IsNewSession(currentSession, g_session))
   {
      //--- If we had a completed pattern, draw pattern label at session start
      if(g_pattern != PATTERN_NONE && g_distStarted)
      {
         DrawPatternLabel(g_pattern, g_sessionStartTime, g_accumHigh);
      }

      ResetSessionState();
      g_session = currentSession;
      g_state = (currentSession != SESSION_NONE) ? AMD_ACCUMULATING : AMD_IDLE;
      g_sessionStartTime = barTime;
      g_accumStartTime = barTime;
      g_accumHigh = high;
      g_accumLow = low;
      g_accumStartPrice = close;

      if(g_state == AMD_ACCUMULATING)
      {
         DrawAccumRect(barTime, barTime, high, low, Color_AccumRect);
      }
   }
   //--- Session ended
   else if(currentSession == SESSION_NONE && g_session != SESSION_NONE)
   {
      //--- Finalize if in distribution and pattern detected
      if(g_pattern != PATTERN_NONE && g_distStarted)
      {
         DrawPatternLabel(g_pattern, g_sessionStartTime, g_accumHigh);
      }
      ResetSessionState();
      g_session = SESSION_NONE;
      g_state = AMD_IDLE;
   }

   //--- Outside any session
   if(g_state == AMD_IDLE)
      return;

   //--- State machine
   switch(g_state)
   {
      //--- ACCUMULATION PHASE
      case AMD_ACCUMULATING:
      {
         //--- Update accumulation range
         g_accumHigh = MathMax(g_accumHigh, high);
         g_accumLow  = MathMin(g_accumLow, low);
         g_accumCandleCount++;

         //--- Update rectangle
         DrawAccumRect(g_accumStartTime, barTime, g_accumHigh, g_accumLow, Color_AccumRect);

         //--- Place A label periodically (not every candle)
         if(g_accumCandleCount <= Accumulation_Period || g_accumCandleCount % 3 == 0)
            PlaceALabel(bar, high, low);

         //--- Check if accumulation complete: enough candles AND tight range
         if(g_accumCandleCount >= Accumulation_Period)
         {
            //--- Check for manipulation breakout
            if(IsBreakout(close, g_accumHigh, g_accumLow, atr) ||
               IsBreakout(high, g_accumHigh, g_accumLow, atr) ||
               IsBreakout(low, g_accumHigh, g_accumLow, atr))
            {
               g_state = AMD_MANIPULATING;
               g_manipSwingHigh = high;
               g_manipSwingLow  = low;
               g_manipSwingTime = barTime;
               g_manipSweptLow  = (low < g_accumLow - atr * Manipulation_Threshold);
               g_manipSweptHigh = (high > g_accumHigh + atr * Manipulation_Threshold);
            }
         }
         break;
      }

      //--- MANIPULATION PHASE
      case AMD_MANIPULATING:
      {
         //--- Track manipulation swing
         g_manipSwingHigh = MathMax(g_manipSwingHigh, high);
         g_manipSwingLow  = MathMin(g_manipSwingLow, low);

         //--- Detect sweep direction
         if(!g_manipSweptLow && low < g_accumLow - atr * Manipulation_Threshold)
         {
            g_manipSweptLow = true;
            g_manipSwingTime = barTime;
         }
         if(!g_manipSweptHigh && high > g_accumHigh + atr * Manipulation_Threshold)
         {
            g_manipSwingHigh = high;
            g_manipSweptHigh = true;
            g_manipSwingTime = barTime;
         }

         //--- Draw manipulation rectangle
         DrawManiRect(g_accumStartTime, barTime, g_manipSwingHigh, g_manipSwingLow, Color_ManiRect);

         //--- Check if manipulation has completed:
         //    Price starts to reverse back into/through accumulation range
         if(g_manipSweptLow && close > g_accumLow)
         {
            //--- Bullish AMD: swept low, now reversing up
            g_manipCompleted = true;
            g_manipSwingLow = MathMin(g_manipSwingLow, low);

            //--- Place M label at sweep point
            PlaceMLabel(bar, g_manipSwingHigh, g_manipSwingLow, true);

            //--- Transition to distribution
            g_state = AMD_DISTRIBUTING;
            g_pattern = PATTERN_BULLISH;
            g_distStarted = true;
            g_distTarget = g_accumHigh + (g_accumHigh - g_accumLow); // Range projection
            g_manipCompleted = true;

            //--- Place D label
            PlaceDLabel(bar, high, low, PATTERN_BULLISH);

            //--- Draw target line
            DrawTargetLine(barTime, g_distTarget, Color_Distribution);
         }
         else if(g_manipSweptHigh && close < g_accumHigh)
         {
            //--- Bearish AMD: swept high, now reversing down
            g_manipCompleted = true;
            g_manipSwingHigh = MathMax(g_manipSwingHigh, high);

            //--- Place M label at sweep point
            PlaceMLabel(bar, g_manipSwingHigh, g_manipSwingLow, false);

            //--- Transition to distribution
            g_state = AMD_DISTRIBUTING;
            g_pattern = PATTERN_BEARISH;
            g_distStarted = true;
            g_distTarget = g_accumLow - (g_accumHigh - g_accumLow); // Range projection
            g_manipCompleted = true;

            //--- Place D label
            PlaceDLabel(bar, high, low, PATTERN_BEARISH);

            //--- Draw target line
            DrawTargetLine(barTime, g_distTarget, Color_Distribution);
         }
         //--- Timeout: manipulation too long without reversal, abort
         else if(barTime - g_accumStartTime > PeriodSeconds(PERIOD_CURRENT) * Accumulation_Period * 4)
         {
            //--- No clean AMD pattern formed
            g_state = AMD_ACCUMULATING;
            g_accumHigh = high;
            g_accumLow = low;
            g_accumCandleCount = 0;
            g_manipSweptLow = false;
            g_manipSweptHigh = false;
         }
         break;
      }

      //--- DISTRIBUTION PHASE
      case AMD_DISTRIBUTING:
      {
         //--- Track distribution progress
         datetime endTime = barTime;

         //--- Extend manipulation rectangle to show overshoot
         DrawManiRect(g_accumStartTime, endTime, g_manipSwingHigh, g_manipSwingLow, Color_ManiRect);

         //--- Update accumulation rectangle to end of session
         DrawAccumRect(g_accumStartTime, endTime, g_accumHigh, g_accumLow, Color_AccumRect);

         //--- Draw target lines at key levels
         if(g_pattern == PATTERN_BULLISH)
         {
            //--- Upper target
            DrawTargetLine(g_accumStartTime, g_distTarget, Color_Distribution);

            //--- Also mark the accumulation high as first target
            if(Show_Target_Lines)
            {
               string tName = g_prefix + "Target1";
               if(ObjectFind(0, tName) < 0)
               {
                  ObjectCreate(0, tName, OBJ_TREND, 0,
                               g_accumStartTime, g_accumHigh,
                               endTime + PeriodSeconds(PERIOD_CURRENT) * 5, g_accumHigh);
                  ObjectSetInteger(0, tName, OBJPROP_COLOR, Color_Distribution);
                  ObjectSetInteger(0, tName, OBJPROP_STYLE, STYLE_DOT);
                  ObjectSetInteger(0, tName, OBJPROP_WIDTH, 1);
                  ObjectSetInteger(0, tName, OBJPROP_RAY_RIGHT, false);
                  ObjectSetInteger(0, tName, OBJPROP_BACK, true);
               }
            }
         }
         else if(g_pattern == PATTERN_BEARISH)
         {
            //--- Lower target
            DrawTargetLine(g_accumStartTime, g_distTarget, Color_Distribution);

            //--- Also mark the accumulation low as first target
            if(Show_Target_Lines)
            {
               string tName = g_prefix + "Target1";
               if(ObjectFind(0, tName) < 0)
               {
                  ObjectCreate(0, tName, OBJ_TREND, 0,
                               g_accumStartTime, g_accumLow,
                               endTime + PeriodSeconds(PERIOD_CURRENT) * 5, g_accumLow);
                  ObjectSetInteger(0, tName, OBJPROP_COLOR, Color_Distribution);
                  ObjectSetInteger(0, tName, OBJPROP_STYLE, STYLE_DOT);
                  ObjectSetInteger(0, tName, OBJPROP_WIDTH, 1);
                  ObjectSetInteger(0, tName, OBJPROP_RAY_RIGHT, false);
                  ObjectSetInteger(0, tName, OBJPROP_BACK, true);
               }
            }
         }

         //--- Draw pattern label once confirmed
         if(g_distStarted && g_pattern != PATTERN_NONE)
            DrawPatternLabel(g_pattern, g_sessionStartTime, g_accumHigh + (g_accumHigh - g_accumLow));

         break;
      }

      default:
         break;
   }
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
   //--- Need enough bars
   if(rates_total < ATR_Period + Accumulation_Period + 10)
      return(rates_total);

   //--- Determine processing range
   int start;
   if(prev_calculated <= 0)
      start = rates_total - Accumulation_Period * 10 - ATR_Period - 10; // Lookback
   else
      start = prev_calculated - 1;

   //--- Process bars from old to new (left to right for state machine)
   for(int i = start; i >= 1; i--)
   {
      //--- Process chronologically: bar index i+1 first, then i
      ProcessBar(i + 1);
      ProcessBar(i);
   }

   //--- Process the latest bar
   ProcessBar(1);

   //--- Update session info display on chart
   UpdateSessionInfo();

   return(rates_total);
}

//+------------------------------------------------------------------+
//| Update session info display on chart                              |
//+------------------------------------------------------------------+
void UpdateSessionInfo()
{
   string objName = g_prefix + "Info";

   string sessionName = "None";
   switch(g_session)
   {
      case SESSION_ASIA:   sessionName = "Asia";   break;
      case SESSION_LONDON: sessionName = "London";  break;
      case SESSION_NY:     sessionName = "NY";      break;
      default:             sessionName = "Idle";    break;
   }

   string stateName = "Idle";
   switch(g_state)
   {
      case AMD_ACCUMULATING: stateName = "ACCUMULATING"; break;
      case AMD_MANIPULATING: stateName = "MANIPULATING"; break;
      case AMD_DISTRIBUTING: stateName = "DISTRIBUTING"; break;
      default:               stateName = "Idle";         break;
   }

   string patternName = "None";
   switch(g_pattern)
   {
      case PATTERN_BULLISH: patternName = "BULLISH AMD"; break;
      case PATTERN_BEARISH: patternName = "BEARISH AMD"; break;
      default:              patternName = "None";         break;
   }

   string info = StringFormat("Session: %s | State: %s | Pattern: %s",
                              sessionName, stateName, patternName);

   if(ObjectFind(0, objName) < 0)
   {
      ObjectCreate(0, objName, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, objName, OBJPROP_CORNER, CORNER_RIGHT_UPPER);
      ObjectSetInteger(0, objName, OBJPROP_XDISTANCE, 10);
      ObjectSetInteger(0, objName, OBJPROP_YDISTANCE, 20);
      ObjectSetInteger(0, objName, OBJPROP_FONTSIZE, 9);
      ObjectSetString(0, objName, OBJPROP_FONT, "Arial");
      ObjectSetInteger(0, objName, OBJPROP_COLOR, clrWhite);
      ObjectSetInteger(0, objName, OBJPROP_SELECTABLE, false);
   }

   ObjectSetString(0, objName, OBJPROP_TEXT, info);

   //--- Color based on state
   switch(g_state)
   {
      case AMD_ACCUMULATING:
         ObjectSetInteger(0, objName, OBJPROP_COLOR, Color_Accumulation);
         break;
      case AMD_MANIPULATING:
         ObjectSetInteger(0, objName, OBJPROP_COLOR, Color_Manipulation);
         break;
      case AMD_DISTRIBUTING:
         ObjectSetInteger(0, objName, OBJPROP_COLOR, Color_Distribution);
         break;
      default:
         ObjectSetInteger(0, objName, OBJPROP_COLOR, clrGray);
         break;
   }
}
//+------------------------------------------------------------------+
