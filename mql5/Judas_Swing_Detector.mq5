//+------------------------------------------------------------------+
//|                                      Judas_Swing_Detector.mq5    |
//|                                      Aegis Terminal Indicator     |
//|                           Detects Judas Swing patterns at        |
//|                           London & NY session opens               |
//+------------------------------------------------------------------+
#property copyright "Aegis Terminal"
#property link      ""
#property version   "1.00"
#property strict
#property indicator_chart_window
#property indicator_buffers 2
#property indicator_plots   2

//--- Plot Bullish Judas (arrow up)
#property indicator_label1  "Bullish Judas"
#property indicator_type1   DRAW_ARROW
#property indicator_color1  clrDodgerBlue
#property indicator_width1  2

//--- Plot Bearish Judas (arrow down)
#property indicator_label2  "Bearish Judas"
#property indicator_type2   DRAW_ARROW
#property indicator_color2  clrCrimson
#property indicator_width2  2

//+------------------------------------------------------------------+
//| Input Parameters                                                   |
//+------------------------------------------------------------------+
input group "=== Session Times (WIB / UTC+7) ==="
input int      London_Start       = 13;       // London open (WIB)
input int      London_End         = 14;       // London end detection window (WIB)
input int      NY_Start           = 19;       // NY open (WIB)
input int      NY_End             = 20;       // NY end detection window (WIB)

input group "=== Detection Settings ==="
input double   Sweep_Threshold    = 2.0;      // Min points price wicks through level
input int      Session_Mins       = 60;       // Max minutes from session open to detect
input bool     Show_Rectangles    = true;     // Draw sweep zone rectangles

input group "=== Visual Settings ==="
input int      Arrow_Size         = 3;        // Arrow size
input color    Bullish_Color      = clrDodgerBlue;  // Bullish Judas color
input color    Bearish_Color      = clrCrimson;      // Bearish Judas color
input color    Bullish_Text_Color = clrDodgerBlue;   // Bullish text color
input color    Bearish_Text_Color = clrCrimson;       // Bearish text color
input color    Sweep_Zone_Color   = clrGold;          // Sweep zone rectangle color
input int      Text_Size          = 8;        // Label font size

//+------------------------------------------------------------------+
//| Indicator Buffers                                                  |
//+------------------------------------------------------------------+
double BullishBuffer[];    // Arrow up buffer
double BearishBuffer[];    // Arrow down buffer

//+------------------------------------------------------------------+
//| Global Variables                                                   |
//+------------------------------------------------------------------+
// Session tracking
datetime g_lastBarTime       = 0;

// Asia session range (pre-London)
double   g_asiaHigh          = 0.0;
double   g_asiaLow           = 0.0;
bool     g_asiaRangeValid    = false;

// London session range (pre-NY)
double   g_londonHigh        = 0.0;
double   g_londonLow         = 0.0;
bool     g_londonRangeValid  = false;

// Current session tracking
int      g_currentSession    = 0;     // 0=none, 1=asia, 2=london, 3=ny
datetime g_sessionOpenTime   = 0;
double   g_sessionHigh       = 0.0;
double   g_sessionLow        = 0.0;

// Detection state per session
bool     g_londonJudasFound  = false;
bool     g_nyJudasFound      = false;

// Sweep state tracking
bool     g_sweepDetected     = false;
double   g_sweepLevel        = 0.0;
int      g_sweepDirection    = 0;     // +1 = swept high, -1 = swept low
datetime g_sweepTime         = 0;
int      g_sweepBarIndex     = -1;

//+------------------------------------------------------------------+
//| Custom indicator initialization function                           |
//+------------------------------------------------------------------+
int OnInit()
  {
//--- Map buffers
   SetIndexBuffer(0, BullishBuffer, INDICATOR_DATA);
   SetIndexBuffer(1, BearishBuffer, INDICATOR_DATA);

//--- Set arrow codes
   PlotIndexSetInteger(0, PLOT_ARROW, 233);   // Arrow up
   PlotIndexSetInteger(1, PLOT_ARROW, 234);   // Arrow down

//--- Set empty values
   PlotIndexSetDouble(0, PLOT_EMPTY_VALUE, EMPTY_VALUE);
   PlotIndexSetDouble(1, PLOT_EMPTY_VALUE, EMPTY_VALUE);

//--- Arrow size
   PlotIndexSetInteger(0, PLOT_LINE_WIDTH, Arrow_Size);
   PlotIndexSetInteger(1, PLOT_LINE_WIDTH, Arrow_Size);

//--- Name
   IndicatorSetString(INDICATOR_SHORTNAME, "Judas Swing Detector");

   return(INIT_SUCCEEDED);
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
//--- Need at least 2 bars
   if(rates_total < 2)
      return(0);

//--- Determine start position
   int start = prev_calculated - 1;
   if(start < 0)
      start = 0;

//--- Initialize on first run
   if(prev_calculated == 0)
     {
      start = 1;
      ArrayInitialize(BullishBuffer, EMPTY_VALUE);
      ArrayInitialize(BearishBuffer, EMPTY_VALUE);
      g_lastBarTime = 0;
     }

//--- Process each bar
   for(int i = start; i < rates_total; i++)
     {
      //--- Get bar time in WIB (UTC+7)
      datetime barTime = time[i];
      MqlDateTime dt;
      TimeToStruct(barTime, dt);
      int hourWIB = dt.hour;  // Server time assumed WIB-adjusted or use GMT offset

      //--- Track session ranges
      TrackSessionRanges(i, time, high, low, close, open);

      //--- Detect London Judas Swing
      DetectJudasSwing(i, time, high, low, close, open,
                       London_Start, London_End,
                       g_asiaHigh, g_asiaLow, g_asiaRangeValid,
                       "London", 2);

      //--- Detect NY Judas Swing
      DetectJudasSwing(i, time, high, low, close, open,
                       NY_Start, NY_End,
                       g_londonHigh, g_londonLow, g_londonRangeValid,
                       "NY", 3);
     }

   return(rates_total);
  }

//+------------------------------------------------------------------+
//| Track session high/low ranges                                       |
//+------------------------------------------------------------------+
void TrackSessionRanges(int index,
                        const datetime &time[],
                        const double &high[],
                        const double &low[],
                        const double &close[],
                        const double &open[])
  {
   MqlDateTime dt;
   TimeToStruct(time[index], dt);
   int hour = dt.hour;

   //--- Asia session: 08:00-12:59 WIB
   if(hour >= 8 && hour < 13)
     {
      if(g_currentSession != 1)
        {
         //--- New Asia session starting
         g_currentSession = 1;
         g_sessionHigh = high[index];
         g_sessionLow = low[index];
         g_sessionOpenTime = time[index];
         g_asiaRangeValid = false;
        }
      else
        {
         //--- Continue tracking Asia range
         if(high[index] > g_sessionHigh)
            g_sessionHigh = high[index];
         if(low[index] < g_sessionLow)
            g_sessionLow = low[index];
        }
     }
   //--- End of Asia session, store range
   else if(g_currentSession == 1 && hour >= 13)
     {
      g_asiaHigh = g_sessionHigh;
      g_asiaLow = g_sessionLow;
      g_asiaRangeValid = true;
      g_currentSession = 2;
      g_sessionHigh = high[index];
      g_sessionLow = low[index];
      g_sessionOpenTime = time[index];
      g_londonJudasFound = false;
      g_sweepDetected = false;
     }

   //--- London session: 13:00-18:59 WIB
   if(hour >= 13 && hour < 19)
     {
      if(g_currentSession != 2)
        {
         g_currentSession = 2;
         g_sessionHigh = high[index];
         g_sessionLow = low[index];
         g_sessionOpenTime = time[index];
         g_londonJudasFound = false;
         g_sweepDetected = false;
        }
      else
        {
         if(high[index] > g_sessionHigh)
            g_sessionHigh = high[index];
         if(low[index] < g_sessionLow)
            g_sessionLow = low[index];
        }
     }
   //--- End of London session, store range
   else if(g_currentSession == 2 && hour >= 19)
     {
      g_londonHigh = g_sessionHigh;
      g_londonLow = g_sessionLow;
      g_londonRangeValid = true;
      g_currentSession = 3;
      g_sessionHigh = high[index];
      g_sessionLow = low[index];
      g_sessionOpenTime = time[index];
      g_nyJudasFound = false;
      g_sweepDetected = false;
     }

   //--- NY session: 19:00-23:59 WIB
   if(hour >= 19)
     {
      if(g_currentSession != 3)
        {
         g_currentSession = 3;
         g_sessionHigh = high[index];
         g_sessionLow = low[index];
         g_sessionOpenTime = time[index];
         g_nyJudasFound = false;
         g_sweepDetected = false;
        }
      else
        {
         if(high[index] > g_sessionHigh)
            g_sessionHigh = high[index];
         if(low[index] < g_sessionLow)
            g_sessionLow = low[index];
        }
     }
  }

//+------------------------------------------------------------------+
//| Detect Judas Swing pattern                                          |
//+------------------------------------------------------------------+
void DetectJudasSwing(int index,
                      const datetime &time[],
                      const double &high[],
                      const double &low[],
                      const double &close[],
                      const double &open[],
                      int sessionStart,
                      int sessionEnd,
                      double refHigh,
                      double refLow,
                      bool refValid,
                      string sessionName,
                      int sessionID)
  {
   //--- Skip if reference range not valid
   if(!refValid)
      return;

   MqlDateTime dt;
   TimeToStruct(time[index], dt);
   int hour = dt.hour;

   //--- Only detect within session window
   if(hour < sessionStart || hour >= sessionEnd)
      return;

   //--- Calculate time elapsed from session start
   int minsFromOpen = (int)((time[index] - g_sessionOpenTime) / 60);
   if(minsFromOpen > Session_Mins)
      return;

   //--- Check if we already found a Judas for this session
   if(sessionID == 2 && g_londonJudasFound)
      return;
   if(sessionID == 3 && g_nyJudasFound)
      return;

   double barHigh = high[index];
   double barLow = low[index];
   double barClose = close[index];
   double barOpen = open[index];

   //--- Phase 1: Detect sweep
   //    Sweep = wick goes through level but candle closes back inside
   if(!g_sweepDetected)
     {
      //--- Check for sweep of reference HIGH (bearish Judas setup)
      if(barHigh > refHigh + Sweep_Threshold * _Point)
        {
         //--- Wick went above refHigh, did it close back below?
         if(barClose < refHigh)
           {
            //--- Sweep of high detected
            g_sweepDetected = true;
            g_sweepLevel = refHigh;
            g_sweepDirection = +1;  // Swept the high
            g_sweepTime = time[index];
            g_sweepBarIndex = index;
           }
        }

      //--- Check for sweep of reference LOW (bullish Judas setup)
      if(barLow < refLow - Sweep_Threshold * _Point)
        {
         //--- Wick went below refLow, did it close back above?
         if(barClose > refLow)
           {
            //--- Sweep of low detected
            g_sweepDetected = true;
            g_sweepLevel = refLow;
            g_sweepDirection = -1;  // Swept the low
            g_sweepTime = time[index];
            g_sweepBarIndex = index;
           }
        }
     }

   //--- Phase 2: Confirm reversal on next candle(s)
   if(g_sweepDetected && index > g_sweepBarIndex)
     {
      //--- Must be within detection window
      int sweepMins = (int)((time[index] - g_sweepTime) / 60);
      if(sweepMins > Session_Mins)
        {
         //--- Timeout, reset
         g_sweepDetected = false;
         return;
        }

      bool reversalConfirmed = false;

      if(g_sweepDirection == +1)
        {
         //--- Swept HIGH -> looking for bearish reversal
         //    Bearish = candle closes lower than it opened
         if(barClose < barOpen)
           {
            reversalConfirmed = true;
            CreateBearishJudas(index, time[index], high[index], low[index],
                               sessionName, refHigh, refLow);
           }
        }
      else if(g_sweepDirection == -1)
        {
         //--- Swept LOW -> looking for bullish reversal
         //    Bullish = candle closes higher than it opened
         if(barClose > barOpen)
           {
            reversalConfirmed = true;
            CreateBullishJudas(index, time[index], high[index], low[index],
                               sessionName, refHigh, refLow);
           }
        }

      if(reversalConfirmed)
        {
         if(sessionID == 2)
            g_londonJudasFound = true;
         if(sessionID == 3)
            g_nyJudasFound = true;
         g_sweepDetected = false;
        }
     }
  }

//+------------------------------------------------------------------+
//| Create Bullish Judas Swing marker                                   |
//+------------------------------------------------------------------+
void CreateBullishJudas(int index, datetime barTime,
                        double barHigh, double barLow,
                        string sessionName,
                        double refHigh, double refLow)
  {
   //--- Place arrow at the low of the sweep candle
   BullishBuffer[index] = barLow;

   //--- Create text label
   string labelName = "Judas_Bull_" + IntegerToString(index);
   ObjectCreate(0, labelName, OBJ_TEXT, 0, barTime, barLow);
   ObjectSetString(0, labelName, OBJPROP_TEXT, "Judas");
   ObjectSetInteger(0, labelName, OBJPROP_COLOR, Bullish_Text_Color);
   ObjectSetInteger(0, labelName, OBJPROP_FONTSIZE, Text_Size);
   ObjectSetString(0, labelName, OBJPROP_FONT, "Arial Bold");
   ObjectSetInteger(0, labelName, OBJPROP_ANCHOR, ANCHOR_UPPER);
   ObjectSetDouble(0, labelName, OBJPROP_PRICE, barLow - 3 * _Point);

   //--- Session label
   string sessLabel = "Judas_sess_" + IntegerToString(index);
   ObjectCreate(0, sessLabel, OBJ_TEXT, 0, barTime, barLow);
   ObjectSetString(0, sessLabel, OBJPROP_TEXT, sessionName);
   ObjectSetInteger(0, sessLabel, OBJPROP_COLOR, Bullish_Text_Color);
   ObjectSetInteger(0, sessLabel, OBJPROP_FONTSIZE, Text_Size - 1);
   ObjectSetString(0, sessLabel, OBJPROP_FONT, "Arial");
   ObjectSetInteger(0, sessLabel, OBJPROP_ANCHOR, ANCHOR_UPPER);
   ObjectSetDouble(0, sessLabel, OBJPROP_PRICE, barLow - 6 * _Point);

   //--- Draw sweep zone rectangle
   if(Show_Rectangles)
     {
      string rectName = "Judas_Rect_" + IntegerToString(index);
      ObjectCreate(0, rectName, OBJ_RECTANGLE, 0, g_sweepTime, refLow, barTime, refLow + Sweep_Threshold * _Point);
      ObjectSetInteger(0, rectName, OBJPROP_COLOR, Sweep_Zone_Color);
      ObjectSetInteger(0, rectName, OBJPROP_FILL, true);
      ObjectSetInteger(0, rectName, OBJPROP_BACK, true);
      ObjectSetInteger(0, rectName, OBJPROP_WIDTH, 1);
      ObjectSetInteger(0, rectName, OBJPROP_STYLE, STYLE_DOT);
     }
  }

//+------------------------------------------------------------------+
//| Create Bearish Judas Swing marker                                   |
//+------------------------------------------------------------------+
void CreateBearishJudas(int index, datetime barTime,
                        double barHigh, double barLow,
                        string sessionName,
                        double refHigh, double refLow)
  {
   //--- Place arrow at the high of the sweep candle
   BearishBuffer[index] = barHigh;

   //--- Create text label
   string labelName = "Judas_Bear_" + IntegerToString(index);
   ObjectCreate(0, labelName, OBJ_TEXT, 0, barTime, barHigh);
   ObjectSetString(0, labelName, OBJPROP_TEXT, "Judas");
   ObjectSetInteger(0, labelName, OBJPROP_COLOR, Bearish_Text_Color);
   ObjectSetInteger(0, labelName, OBJPROP_FONTSIZE, Text_Size);
   ObjectSetString(0, labelName, OBJPROP_FONT, "Arial Bold");
   ObjectSetInteger(0, labelName, OBJPROP_ANCHOR, ANCHOR_LOWER);
   ObjectSetDouble(0, labelName, OBJPROP_PRICE, barHigh + 3 * _Point);

   //--- Session label
   string sessLabel = "Judas_sess_" + IntegerToString(index);
   ObjectCreate(0, sessLabel, OBJ_TEXT, 0, barTime, barHigh);
   ObjectSetString(0, sessLabel, OBJPROP_TEXT, sessionName);
   ObjectSetInteger(0, sessLabel, OBJPROP_COLOR, Bearish_Text_Color);
   ObjectSetInteger(0, sessLabel, OBJPROP_FONTSIZE, Text_Size - 1);
   ObjectSetString(0, sessLabel, OBJPROP_FONT, "Arial");
   ObjectSetInteger(0, sessLabel, OBJPROP_ANCHOR, ANCHOR_LOWER);
   ObjectSetDouble(0, sessLabel, OBJPROP_PRICE, barHigh + 6 * _Point);

   //--- Draw sweep zone rectangle
   if(Show_Rectangles)
     {
      string rectName = "Judas_Rect_" + IntegerToString(index);
      ObjectCreate(0, rectName, OBJ_RECTANGLE, 0, g_sweepTime, refHigh - Sweep_Threshold * _Point, barTime, refHigh);
      ObjectSetInteger(0, rectName, OBJPROP_COLOR, Sweep_Zone_Color);
      ObjectSetInteger(0, rectName, OBJPROP_FILL, true);
      ObjectSetInteger(0, rectName, OBJPROP_BACK, true);
      ObjectSetInteger(0, rectName, OBJPROP_WIDTH, 1);
      ObjectSetInteger(0, rectName, OBJPROP_STYLE, STYLE_DOT);
     }
  }

//+------------------------------------------------------------------+
//| Deinit - cleanup chart objects                                      |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   //--- Remove all created objects
   ObjectsDeleteAll(0, "Judas_");
  }
//+------------------------------------------------------------------+
