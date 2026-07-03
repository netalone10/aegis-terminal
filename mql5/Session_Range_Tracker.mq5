//+------------------------------------------------------------------+
//|                                        Session_Range_Tracker.mq5  |
//|                                        Aegis Terminal             |
//|                                   Session Range Tracking EA       |
//+------------------------------------------------------------------+
#property copyright "Aegis Terminal"
#property link      ""
#property version   "1.00"
#property strict

#include <Trade/Trade.mqh>

//+------------------------------------------------------------------+
//| Input Parameters - Session Times (WIB UTC+7)                     |
//+------------------------------------------------------------------+
input group "=== Asia Session (WIB) ==="
input int    Asia_StartHour    = 7;       // Asia Start Hour (WIB)
input int    Asia_StartMin     = 0;       // Asia Start Minute
input int    Asia_EndHour      = 11;      // Asia End Hour (WIB)
input int    Asia_EndMin       = 0;       // Asia End Minute

input group "=== London Session (WIB) ==="
input int    London_StartHour  = 13;      // London Start Hour (WIB)
input int    London_StartMin   = 0;       // London Start Minute
input int    London_EndHour    = 17;      // London End Hour (WIB)
input int    London_EndMin     = 0;       // London End Minute

input group "=== NY AM Session (WIB) ==="
input int    NY_AM_StartHour   = 19;      // NY AM Start Hour (WIB)
input int    NY_AM_StartMin    = 0;       // NY AM Start Minute
input int    NY_AM_EndHour     = 23;      // NY AM End Hour (WIB)
input int    NY_AM_EndMin      = 0;       // NY AM End Minute

input group "=== NY PM Session (WIB) ==="
input int    NY_PM_StartHour   = 0;       // NY PM Start Hour (WIB)
input int    NY_PM_StartMin    = 0;       // NY PM Start Minute
input int    NY_PM_EndHour     = 3;       // NY PM End Hour (WIB)
input int    NY_PM_EndMin      = 0;       // NY PM End Minute

input group "=== Visual Settings ==="
input color  Asia_HighColor    = clrDodgerBlue;   // Asia High Line Color
input color  Asia_LowColor     = clrSteelBlue;    // Asia Low Line Color
input color  Asia_RectColor    = clrLightBlue;    // Asia Range Rectangle Color
input color  London_SweepColor = clrRed;          // London Sweep Color
input color  London_LineColor  = clrOrangeRed;    // London High/Low Line Color
input color  NY_AM_Color       = clrGreen;        // NY AM Line Color
input color  NY_PM_Color       = clrLimeGreen;    // NY PM Line Color
input color  Panel_BG_Color    = clrBlack;        // Info Panel Background
input color  Panel_TextColor   = clrWhite;        // Info Panel Text Color

input group "=== Display Settings ==="
input int    Line_Width        = 2;       // Line Width
input ENUM_LINE_STYLE Line_Style = STYLE_SOLID;  // Line Style
input bool   ShowRectangle     = true;    // Show Asia Range Rectangle
input bool   ShowSweepArrows   = true;    // Show Sweep Arrows
input bool   ShowInfoPanel     = true;    // Show Info Panel
input int    Panel_X           = 10;      // Panel X Position
input int    Panel_Y           = 30;      // Panel Y Position
input int    Arrow_Size        = 3;       // Arrow Size

input group "=== Other Settings ==="
input bool   ResetOnMonday     = true;    // Force Reset on Monday
input int    MagicNumber       = 887766;  // Magic Number

//+------------------------------------------------------------------+
//| Global Variables                                                  |
//+------------------------------------------------------------------+
struct SessionData
{
   double   high;
   double   low;
   bool     active;
   datetime start_time;
   datetime end_time;
};

SessionData  asia_session;
SessionData  london_session;
SessionData  nyam_session;
SessionData  nypm_session;

// Track previous sessions for comparison
SessionData  prev_asia;
SessionData  prev_london;
SessionData  prev_nyam;
SessionData  prev_nypm;

// Sweep tracking
bool         london_swept_asia_high = false;
bool         london_swept_asia_low  = false;
bool         nyam_swept_asia_high   = false;
bool         nyam_swept_asia_low    = false;
bool         nypm_swept_asia_high   = false;
bool         nypm_swept_asia_low    = false;

// Object name prefixes
const string OBJ_PREFIX = "SRT_";

// Object names
const string ASIA_HIGH_LINE    = OBJ_PREFIX + "AsiaHigh";
const string ASIA_LOW_LINE     = OBJ_PREFIX + "AsiaLow";
const string ASIA_RECTANGLE    = OBJ_PREFIX + "AsiaRange";
const string LONDON_HIGH_LINE  = OBJ_PREFIX + "LondonHigh";
const string LONDON_LOW_LINE   = OBJ_PREFIX + "LondonLow";
const string NYAM_HIGH_LINE    = OBJ_PREFIX + "NYAMHigh";
const string NYAM_LOW_LINE     = OBJ_PREFIX + "NYAMLow";
const string NYPM_HIGH_LINE    = OBJ_PREFIX + "NYPMHigh";
const string NYPM_LOW_LINE     = OBJ_PREFIX + "NYPMLow";
const string SWEEP_ARROW_PREF  = OBJ_PREFIX + "SweepArrow";
const string SWEEP_TEXT_PREF    = OBJ_PREFIX + "SweepText";

// Current day tracking
int          current_day = 0;
bool         range_initialized = false;

//+------------------------------------------------------------------+
//| Expert initialization function                                     |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("Session Range Tracker initialized");
   Print("Session times (WIB UTC+7):");
   Print("  Asia: ", Asia_StartHour, ":", StringFormat("%02d", Asia_StartMin), 
         " - ", Asia_EndHour, ":", StringFormat("%02d", Asia_EndMin));
   Print("  London: ", London_StartHour, ":", StringFormat("%02d", London_StartMin), 
         " - ", London_EndHour, ":", StringFormat("%02d", London_EndMin));
   Print("  NY AM: ", NY_AM_StartHour, ":", StringFormat("%02d", NY_AM_StartMin), 
         " - ", NY_AM_EndHour, ":", StringFormat("%02d", NY_AM_EndMin));
   Print("  NY PM: ", NY_PM_StartHour, ":", StringFormat("%02d", NY_PM_StartMin), 
         " - ", NY_PM_EndHour, ":", StringFormat("%02d", NY_PM_EndMin));
   
   // Initialize sessions
   ResetAllSessions();
   
   // Get current day
   MqlDateTime dt;
   TimeCurrent(dt);
   current_day = dt.day_of_year;
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                   |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   // Clean up all objects
   ObjectsDeleteAll(0, OBJ_PREFIX);
   Comment("");
   Print("Session Range Tracker deinitialized");
}

//+------------------------------------------------------------------+
//| Expert tick function                                              |
//+------------------------------------------------------------------+
void OnTick()
{
   MqlDateTime dt;
   TimeCurrent(dt);
   
   // Check for new day / Monday reset
   if(dt.day_of_year != current_day)
   {
      current_day = dt.day_of_year;
      
      // Save previous session data before reset
      if(range_initialized)
      {
         prev_asia = asia_session;
         prev_london = london_session;
         prev_nyam = nyam_session;
         prev_nypm = nypm_session;
      }
      
      // Monday reset or new day
      if(ResetOnMonday && dt.day_of_week == 1)
      {
         ResetAllSessions();
         Print("Monday reset - all sessions cleared");
      }
      else if(dt.day_of_week == 0 || dt.day_of_week == 6)
      {
         // Weekend - skip
         return;
      }
      else
      {
         ResetCurrentDaySessions();
      }
      
      range_initialized = true;
   }
   
   // Skip weekends
   if(dt.day_of_week == 0 || dt.day_of_week == 6)
      return;
   
   // Convert current time to WIB (UTC+7)
   int current_hour_wib = (dt.hour + 7) % 24;
   int current_min_wib = dt.min;
   int current_time_wib = current_hour_wib * 100 + current_min_wib;
   
   // Get current prices
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   
   // Track Asia session range
   TrackSession(asia_session, Asia_StartHour, Asia_StartMin, Asia_EndHour, Asia_EndMin, 
                current_time_wib, bid, ask);
   
   // Track London session range
   TrackSession(london_session, London_StartHour, London_StartMin, London_EndHour, London_EndMin, 
                current_time_wib, bid, ask);
   
   // Track NY AM session range
   TrackSession(nyam_session, NY_AM_StartHour, NY_AM_StartMin, NY_AM_EndHour, NY_AM_EndMin, 
                current_time_wib, bid, ask);
   
   // Track NY PM session range
   TrackSession(nypm_session, NY_PM_StartHour, NY_PM_StartMin, NY_PM_EndHour, NY_PM_EndMin, 
                current_time_wib, bid, ask);
   
   // Check for London sweeps of Asia levels
   CheckLondonSweeps(current_time_wib, bid, ask);
   
   // Check for NY sweeps
   CheckNYSweeps(current_time_wib, bid, ask);
   
   // Update visual objects
   UpdateSessionLines();
   
   // Update info panel
   if(ShowInfoPanel)
      UpdateInfoPanel();
}

//+------------------------------------------------------------------+
//| Reset all sessions                                                |
//+------------------------------------------------------------------+
void ResetAllSessions()
{
   ResetSessionData(asia_session);
   ResetSessionData(london_session);
   ResetSessionData(nyam_session);
   ResetSessionData(nypm_session);
   
   ResetSessionData(prev_asia);
   ResetSessionData(prev_london);
   ResetSessionData(prev_nyam);
   ResetSessionData(prev_nypm);
   
   ResetSweeps();
   
   // Clean up old objects
   ObjectsDeleteAll(0, OBJ_PREFIX);
}

//+------------------------------------------------------------------+
//| Reset current day sessions only                                   |
//+------------------------------------------------------------------+
void ResetCurrentDaySessions()
{
   ResetSessionData(asia_session);
   ResetSessionData(london_session);
   ResetSessionData(nyam_session);
   ResetSessionData(nypm_session);
   
   ResetSweeps();
   
   // Clean up old objects
   ObjectsDeleteAll(0, OBJ_PREFIX);
}

//+------------------------------------------------------------------+
//| Reset session data                                                |
//+------------------------------------------------------------------+
void ResetSessionData(SessionData &session)
{
   session.high = 0.0;
   session.low = DBL_MAX;
   session.active = false;
   session.start_time = 0;
   session.end_time = 0;
}

//+------------------------------------------------------------------+
//| Reset sweep flags                                                 |
//+------------------------------------------------------------------+
void ResetSweeps()
{
   london_swept_asia_high = false;
   london_swept_asia_low = false;
   nyam_swept_asia_high = false;
   nyam_swept_asia_low = false;
   nypm_swept_asia_high = false;
   nypm_swept_asia_low = false;
}

//+------------------------------------------------------------------+
//| Track session range                                               |
//+------------------------------------------------------------------+
void TrackSession(SessionData &session, int start_h, int start_m, int end_h, int end_m,
                  int current_time_wib, double bid, double ask)
{
   int start_time = start_h * 100 + start_m;
   int end_time = end_h * 100 + end_m;
   
   // Handle sessions that cross midnight (e.g., NY PM)
   bool in_session = false;
   if(start_time < end_time)
   {
      // Normal session (doesn't cross midnight)
      in_session = (current_time_wib >= start_time && current_time_wib < end_time);
   }
   else
   {
      // Session crosses midnight
      in_session = (current_time_wib >= start_time || current_time_wib < end_time);
   }
   
   if(in_session)
   {
      if(!session.active)
      {
         // Session just started
         session.active = true;
         session.high = bid;
         session.low = bid;
         session.start_time = TimeCurrent();
         Print("Session started at ", TimeToString(TimeCurrent()));
      }
      
      // Update high/low
      double high_price = MathMax(bid, ask);
      double low_price = MathMin(bid, ask);
      
      if(high_price > session.high)
         session.high = high_price;
      if(low_price < session.low)
         session.low = low_price;
   }
   else if(session.active)
   {
      // Session just ended
      session.active = false;
      session.end_time = TimeCurrent();
      Print("Session ended at ", TimeToString(TimeCurrent()));
   }
}

//+------------------------------------------------------------------+
//| Check London sweeps of Asia levels                                |
//+------------------------------------------------------------------+
void CheckLondonSweeps(int current_time_wib, double bid, double ask)
{
   if(!london_session.active || !prev_asia.active)
      return;
   
   // Check if we're in London session
   int start_time = London_StartHour * 100 + London_StartMin;
   int end_time = London_EndHour * 100 + London_EndMin;
   
   bool in_london = (current_time_wib >= start_time && current_time_wib < end_time);
   if(!in_london)
      return;
   
   double price = bid;
   
   // Check Asia high sweep
   if(!london_swept_asia_high && price >= prev_asia.high)
   {
      london_swept_asia_high = true;
      if(ShowSweepArrows)
         CreateSweepArrow("London Sweep High", prev_asia.high, true);
      Print("London swept Asia High: ", DoubleToString(prev_asia.high, _Digits));
   }
   
   // Check Asia low sweep
   if(!london_swept_asia_low && price <= prev_asia.low)
   {
      london_swept_asia_low = true;
      if(ShowSweepArrows)
         CreateSweepArrow("London Sweep Low", prev_asia.low, false);
      Print("London swept Asia Low: ", DoubleToString(prev_asia.low, _Digits));
   }
}

//+------------------------------------------------------------------+
//| Check NY sweeps of Asia levels                                    |
//+------------------------------------------------------------------+
void CheckNYSweeps(int current_time_wib, double bid, double ask)
{
   if(!prev_asia.active)
      return;
   
   double price = bid;
   
   // Check NY AM
   if(nyam_session.active)
   {
      int start_time = NY_AM_StartHour * 100 + NY_AM_StartMin;
      int end_time = NY_AM_EndHour * 100 + NY_AM_EndMin;
      
      bool in_nyam = (current_time_wib >= start_time && current_time_wib < end_time);
      if(in_nyam)
      {
         if(!nyam_swept_asia_high && price >= prev_asia.high)
         {
            nyam_swept_asia_high = true;
            Print("NY AM swept Asia High: ", DoubleToString(prev_asia.high, _Digits));
         }
         
         if(!nyam_swept_asia_low && price <= prev_asia.low)
         {
            nyam_swept_asia_low = true;
            Print("NY AM swept Asia Low: ", DoubleToString(prev_asia.low, _Digits));
         }
      }
   }
   
   // Check NY PM
   if(nypm_session.active)
   {
      int start_time = NY_PM_StartHour * 100 + NY_PM_StartMin;
      int end_time = NY_PM_EndHour * 100 + NY_PM_EndMin;
      
      bool in_nypm = false;
      if(start_time < end_time)
         in_nypm = (current_time_wib >= start_time && current_time_wib < end_time);
      else
         in_nypm = (current_time_wib >= start_time || current_time_wib < end_time);
      
      if(in_nypm)
      {
         if(!nypm_swept_asia_high && price >= prev_asia.high)
         {
            nypm_swept_asia_high = true;
            Print("NY PM swept Asia High: ", DoubleToString(prev_asia.high, _Digits));
         }
         
         if(!nypm_swept_asia_low && price <= prev_asia.low)
         {
            nypm_swept_asia_low = true;
            Print("NY PM swept Asia Low: ", DoubleToString(prev_asia.low, _Digits));
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Create sweep arrow and text                                       |
//+------------------------------------------------------------------+
void CreateSweepArrow(string label, double price, bool is_high)
{
   datetime time = TimeCurrent();
   string arrow_name = SWEEP_ARROW_PREF + IntegerToString(TimeCurrent());
   string text_name = SWEEP_TEXT_PREF + IntegerToString(TimeCurrent());
   
   // Create arrow
   ObjectCreate(0, arrow_name, OBJ_ARROW, 0, time, price);
   ObjectSetInteger(0, arrow_name, OBJPROP_ARROWCODE, is_high ? 234 : 233); // Up/Down arrow
   ObjectSetInteger(0, arrow_name, OBJPROP_COLOR, London_SweepColor);
   ObjectSetInteger(0, arrow_name, OBJPROP_WIDTH, Arrow_Size);
   ObjectSetInteger(0, arrow_name, OBJPROP_SELECTABLE, false);
   
   // Create text label
   ObjectCreate(0, text_name, OBJ_TEXT, 0, time, price);
   ObjectSetString(0, text_name, OBJPROP_TEXT, label);
   ObjectSetInteger(0, text_name, OBJPROP_COLOR, London_SweepColor);
   ObjectSetInteger(0, text_name, OBJPROP_FONTSIZE, 10);
   ObjectSetString(0, text_name, OBJPROP_FONT, "Arial Bold");
   ObjectSetInteger(0, text_name, OBJPROP_ANCHOR, is_high ? ANCHOR_LOWER : ANCHOR_UPPER);
   ObjectSetInteger(0, text_name, OBJPROP_SELECTABLE, false);
}

//+------------------------------------------------------------------+
//| Update session lines on chart                                     |
//+------------------------------------------------------------------+
void UpdateSessionLines()
{
   // Clean up old objects
   ObjectsDeleteAll(0, OBJ_PREFIX);
   
   // Draw Asia session
   if(asia_session.high > 0 && asia_session.low < DBL_MAX)
   {
      DrawHorizontalLine(ASIA_HIGH_LINE, asia_session.high, Asia_HighColor, "Asia High");
      DrawHorizontalLine(ASIA_LOW_LINE, asia_session.low, Asia_LowColor, "Asia Low");
      
      if(ShowRectangle)
         DrawRectangle(ASIA_RECTANGLE, asia_session.high, asia_session.low, Asia_RectColor);
      
      // Continue drawing lines even after session ends
      if(!asia_session.active)
      {
         // Draw dashed lines for closed session
         ObjectSetInteger(0, ASIA_HIGH_LINE, OBJPROP_STYLE, STYLE_DASH);
         ObjectSetInteger(0, ASIA_LOW_LINE, OBJPROP_STYLE, STYLE_DASH);
      }
   }
   
   // Draw London session
   if(london_session.high > 0 && london_session.low < DBL_MAX)
   {
      color london_color = (london_swept_asia_high || london_swept_asia_low) ? London_SweepColor : London_LineColor;
      DrawHorizontalLine(LONDON_HIGH_LINE, london_session.high, london_color, "London High");
      DrawHorizontalLine(LONDON_LOW_LINE, london_session.low, london_color, "London Low");
      
      if(!london_session.active)
      {
         ObjectSetInteger(0, LONDON_HIGH_LINE, OBJPROP_STYLE, STYLE_DASH);
         ObjectSetInteger(0, LONDON_LOW_LINE, OBJPROP_STYLE, STYLE_DASH);
      }
   }
   
   // Draw NY AM session
   if(nyam_session.high > 0 && nyam_session.low < DBL_MAX)
   {
      DrawHorizontalLine(NYAM_HIGH_LINE, nyam_session.high, NY_AM_Color, "NY AM High");
      DrawHorizontalLine(NYAM_LOW_LINE, nyam_session.low, NY_AM_Color, "NY AM Low");
      
      if(!nyam_session.active)
      {
         ObjectSetInteger(0, NYAM_HIGH_LINE, OBJPROP_STYLE, STYLE_DASH);
         ObjectSetInteger(0, NYAM_LOW_LINE, OBJPROP_STYLE, STYLE_DASH);
      }
   }
   
   // Draw NY PM session
   if(nypm_session.high > 0 && nypm_session.low < DBL_MAX)
   {
      DrawHorizontalLine(NYPM_HIGH_LINE, nypm_session.high, NY_PM_Color, "NY PM High");
      DrawHorizontalLine(NYPM_LOW_LINE, nypm_session.low, NY_PM_Color, "NY PM Low");
      
      if(!nypm_session.active)
      {
         ObjectSetInteger(0, NYPM_HIGH_LINE, OBJPROP_STYLE, STYLE_DASH);
         ObjectSetInteger(0, NYPM_LOW_LINE, OBJPROP_STYLE, STYLE_DASH);
      }
   }
   
   ChartRedraw(0);
}

//+------------------------------------------------------------------+
//| Draw horizontal line                                              |
//+------------------------------------------------------------------+
void DrawHorizontalLine(string name, double price, color clr, string label)
{
   datetime start_time = TimeCurrent() - PeriodSeconds(PERIOD_H1) * 5;
   datetime end_time = TimeCurrent() + PeriodSeconds(PERIOD_H1) * 5;
   
   ObjectCreate(0, name, OBJ_HLINE, 0, 0, price);
   ObjectSetDouble(0, name, OBJPROP_PRICE, price);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, Line_Width);
   ObjectSetInteger(0, name, OBJPROP_STYLE, Line_Style);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetString(0, name, OBJPROP_TEXT, label);
}

//+------------------------------------------------------------------+
//| Draw rectangle for Asia range                                     |
//+------------------------------------------------------------------+
void DrawRectangle(string name, double high, double low, color clr)
{
   datetime start_time = TimeCurrent() - PeriodSeconds(PERIOD_H1) * 5;
   datetime end_time = TimeCurrent() + PeriodSeconds(PERIOD_H1) * 5;
   
   ObjectCreate(0, name, OBJ_RECTANGLE, 0, start_time, high, end_time, low);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_FILL, true);
   ObjectSetInteger(0, name, OBJPROP_BACK, true);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetString(0, name, OBJPROP_TEXT, "Asia Range");
}

//+------------------------------------------------------------------+
//| Update info panel                                                 |
//+------------------------------------------------------------------+
void UpdateInfoPanel()
{
   string text = "";
   
   // Get current session
   string current_session = GetCurrentSessionName();
   
   // Get current price
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   
   text += "=== SESSION RANGE TRACKER ===\n";
   text += "Symbol: " + _Symbol + "\n";
   text += "Time: " + TimeToString(TimeCurrent()) + "\n";
   text += "Current Session: " + current_session + "\n";
   text += "Current Price: " + DoubleToString(bid, _Digits) + "\n\n";
   
   // Asia session info
   text += "ASIA SESSION:\n";
   if(asia_session.high > 0 && asia_session.low < DBL_MAX)
   {
      text += "  High: " + DoubleToString(asia_session.high, _Digits) + "\n";
      text += "  Low: " + DoubleToString(asia_session.low, _Digits) + "\n";
      text += "  Range: " + DoubleToString(asia_session.high - asia_session.low, _Digits) + "\n";
      text += "  Status: " + (asia_session.active ? "ACTIVE" : "CLOSED") + "\n";
      
      // Check if price is inside/outside range
      if(bid > asia_session.high)
         text += "  Price Position: ABOVE RANGE\n";
      else if(bid < asia_session.low)
         text += "  Price Position: BELOW RANGE\n";
      else
         text += "  Price Position: INSIDE RANGE\n";
   }
   else
      text += "  No data yet\n";
   text += "\n";
   
   // Previous Asia session info (for sweep tracking)
   if(prev_asia.high > 0 && prev_asia.low < DBL_MAX)
   {
      text += "PREV ASIA SESSION:\n";
      text += "  High: " + DoubleToString(prev_asia.high, _Digits) + "\n";
      text += "  Low: " + DoubleToString(prev_asia.low, _Digits) + "\n\n";
   }
   
   // London session info
   text += "LONDON SESSION:\n";
   if(london_session.high > 0 && london_session.low < DBL_MAX)
   {
      text += "  High: " + DoubleToString(london_session.high, _Digits) + "\n";
      text += "  Low: " + DoubleToString(london_session.low, _Digits) + "\n";
      text += "  Range: " + DoubleToString(london_session.high - london_session.low, _Digits) + "\n";
      text += "  Status: " + (london_session.active ? "ACTIVE" : "CLOSED") + "\n";
      
      // Check if price is inside/outside range
      if(bid > london_session.high)
         text += "  Price Position: ABOVE RANGE\n";
      else if(bid < london_session.low)
         text += "  Price Position: BELOW RANGE\n";
      else
         text += "  Price Position: INSIDE RANGE\n";
   }
   else
      text += "  No data yet\n";
   
   // Sweep status
   text += "  Sweeps: ";
   if(london_swept_asia_high)
      text += "ASIA HIGH SWEPT ";
   if(london_swept_asia_low)
      text += "ASIA LOW SWEPT ";
   if(!london_swept_asia_high && !london_swept_asia_low)
      text += "None";
   text += "\n\n";
   
   // NY AM session info
   text += "NY AM SESSION:\n";
   if(nyam_session.high > 0 && nyam_session.low < DBL_MAX)
   {
      text += "  High: " + DoubleToString(nyam_session.high, _Digits) + "\n";
      text += "  Low: " + DoubleToString(nyam_session.low, _Digits) + "\n";
      text += "  Range: " + DoubleToString(nyam_session.high - nyam_session.low, _Digits) + "\n";
      text += "  Status: " + (nyam_session.active ? "ACTIVE" : "CLOSED") + "\n";
      
      // Check if price is inside/outside range
      if(bid > nyam_session.high)
         text += "  Price Position: ABOVE RANGE\n";
      else if(bid < nyam_session.low)
         text += "  Price Position: BELOW RANGE\n";
      else
         text += "  Price Position: INSIDE RANGE\n";
   }
   else
      text += "  No data yet\n";
   
   // Sweep status
   text += "  Sweeps: ";
   if(nyam_swept_asia_high)
      text += "ASIA HIGH SWEPT ";
   if(nyam_swept_asia_low)
      text += "ASIA LOW SWEPT ";
   if(!nyam_swept_asia_high && !nyam_swept_asia_low)
      text += "None";
   text += "\n\n";
   
   // NY PM session info
   text += "NY PM SESSION:\n";
   if(nypm_session.high > 0 && nypm_session.low < DBL_MAX)
   {
      text += "  High: " + DoubleToString(nypm_session.high, _Digits) + "\n";
      text += "  Low: " + DoubleToString(nypm_session.low, _Digits) + "\n";
      text += "  Range: " + DoubleToString(nypm_session.high - nypm_session.low, _Digits) + "\n";
      text += "  Status: " + (nypm_session.active ? "ACTIVE" : "CLOSED") + "\n";
      
      // Check if price is inside/outside range
      if(bid > nypm_session.high)
         text += "  Price Position: ABOVE RANGE\n";
      else if(bid < nypm_session.low)
         text += "  Price Position: BELOW RANGE\n";
      else
         text += "  Price Position: INSIDE RANGE\n";
   }
   else
      text += "  No data yet\n";
   
   // Sweep status
   text += "  Sweeps: ";
   if(nypm_swept_asia_high)
      text += "ASIA HIGH SWEPT ";
   if(nypm_swept_asia_low)
      text += "ASIA LOW SWEPT ";
   if(!nypm_swept_asia_high && !nypm_swept_asia_low)
      text += "None";
   text += "\n";
   
   Comment(text);
}

//+------------------------------------------------------------------+
//| Get current session name                                          |
//+------------------------------------------------------------------+
string GetCurrentSessionName()
{
   MqlDateTime dt;
   TimeCurrent(dt);
   
   // Convert to WIB
   int hour_wib = (dt.hour + 7) % 24;
   int min_wib = dt.min;
   int time_wib = hour_wib * 100 + min_wib;
   
   // Check Asia
   int asia_start = Asia_StartHour * 100 + Asia_StartMin;
   int asia_end = Asia_EndHour * 100 + Asia_EndMin;
   if(time_wib >= asia_start && time_wib < asia_end)
      return "ASIA";
   
   // Check London
   int london_start = London_StartHour * 100 + London_StartMin;
   int london_end = London_EndHour * 100 + London_EndMin;
   if(time_wib >= london_start && time_wib < london_end)
      return "LONDON";
   
   // Check NY AM
   int nyam_start = NY_AM_StartHour * 100 + NY_AM_StartMin;
   int nyam_end = NY_AM_EndHour * 100 + NY_AM_EndMin;
   if(time_wib >= nyam_start && time_wib < nyam_end)
      return "NY AM";
   
   // Check NY PM (crosses midnight)
   int nypm_start = NY_PM_StartHour * 100 + NY_PM_StartMin;
   int nypm_end = NY_PM_EndHour * 100 + NY_PM_EndMin;
   if(nypm_start < nypm_end)
   {
      if(time_wib >= nypm_start && time_wib < nypm_end)
         return "NY PM";
   }
   else
   {
      if(time_wib >= nypm_start || time_wib < nypm_end)
         return "NY PM";
   }
   
   return "OFF SESSION";
}

//+------------------------------------------------------------------+
//| Check if price is inside session range                            |
//+------------------------------------------------------------------+
bool IsInsideRange(double price, SessionData &session)
{
   if(session.high <= 0 || session.low >= DBL_MAX)
      return false;
   
   return (price >= session.low && price <= session.high);
}

//+------------------------------------------------------------------+
//| Check if price is above session range                             |
//+------------------------------------------------------------------+
bool IsAboveRange(double price, SessionData &session)
{
   if(session.high <= 0)
      return false;
   
   return (price > session.high);
}

//+------------------------------------------------------------------+
//| Check if price is below session range                             |
//+------------------------------------------------------------------+
bool IsBelowRange(double price, SessionData &session)
{
   if(session.low >= DBL_MAX)
      return false;
   
   return (price < session.low);
}
//+------------------------------------------------------------------+
