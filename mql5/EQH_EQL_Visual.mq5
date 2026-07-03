//+------------------------------------------------------------------+
//|                                              EQH_EQL_Visual.mq5 |
//|                                   Equal Highs / Equal Lows Visual |
//|                                                                  |
//|  Detects and visualizes Equal Highs (EQH) and Equal Lows (EQL)   |
//|  with liquidity annotations (BSL/SSL) and auto-cleanup.           |
//+------------------------------------------------------------------+
#property copyright "AEGIS Terminal"
#property link      ""
#property version   "1.00"
#property indicator_chart_window
#property indicator_buffers 2
#property indicator_plots   0

//--- input parameters
input double InpThresholdPips  = 5.0;     // Equal Threshold (pips)
input int    InpLookback       = 50;      // Lookback Bars
input int    InpMaxLevels      = 10;      // Max Levels to Show
input int    InpSwingStrength  = 3;       // Swing Confirmation (candles each side)
input color  InpEQHColor       = clrRed;  // EQH Color
input color  InpEQLColor       = clrGreen;// EQL Color
input color  InpSweptColor     = clrGray; // Swept Color
input color  InpBSLColor       = clrRed;  // BSL Label Color
input color  InpSSLColor       = clrGreen;// SSL Label Color
input bool   InpShowRectangles = true;    // Show Zone Rectangles
input bool   InpShowLiquidity  = true;    // Show BSL/SSL Annotations
input bool   InpShowDistance   = true;    // Show Distance to Level
input int    InpFontSize       = 8;       // Label Font Size

//--- indicator buffers
double BufferEQH[];
double BufferEQL[];

//--- level structure
struct EQLevel
{
   double   price;        // price level
   int      count;        // number of touches
   int      type;         // 1 = EQH, -1 = EQL
   datetime firstTime;    // time of first swing
   datetime lastTime;     // time of last swing
   bool     swept;        // has price broken through?
   bool     active;       // still valid?
};

//--- globals
EQLevel g_levels[];
int     g_levelCount = 0;

//+------------------------------------------------------------------+
//| Custom indicator initialization function                          |
//+------------------------------------------------------------------+
int OnInit()
{
   SetIndexBuffer(0, BufferEQH, INDICATOR_DATA);
   SetIndexBuffer(1, BufferEQL, INDICATOR_DATA);
   ArrayResize(g_levels, 0);
   g_levelCount = 0;
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Custom indicator deinitialization function                        |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   ObjectsDeleteAll(0, "EQH_", -1, -1);
   ObjectsDeleteAll(0, "EQL_", -1, -1);
   ObjectsDeleteAll(0, "EQH_RECT_", -1, -1);
   ObjectsDeleteAll(0, "EQL_RECT_", -1, -1);
   ObjectsDeleteAll(0, "EQH_BSL_", -1, -1);
   ObjectsDeleteAll(0, "EQL_SSL_", -1, -1);
}

//+------------------------------------------------------------------+
//| Pips to price value                                               |
//+------------------------------------------------------------------+
double PipsToPrice(double pips)
{
   double pipSize = _Point;
   if(_Digits == 3 || _Digits == 5)
      pipSize *= 10.0;
   return pips * pipSize;
}

//+------------------------------------------------------------------+
//| Check if bar i is a swing high (local high with N-bar confirmation)|
//+------------------------------------------------------------------+
bool IsSwingHigh(const double &high[], int i, int strength, int total)
{
   if(i - strength < 0 || i + strength >= total)
      return false;

   for(int k = 1; k <= strength; k++)
   {
      if(high[i] <= high[i - k] || high[i] <= high[i + k])
         return false;
   }
   return true;
}

//+------------------------------------------------------------------+
//| Check if bar i is a swing low                                       |
//+------------------------------------------------------------------+
bool IsSwingLow(const double &low[], int i, int strength, int total)
{
   if(i - strength < 0 || i + strength >= total)
      return false;

   for(int k = 1; k <= strength; k++)
   {
      if(low[i] >= low[i - k] || low[i] >= low[i + k])
         return false;
   }
   return true;
}

//+------------------------------------------------------------------+
//| Find or create an EQ level within threshold of given price         |
//+------------------------------------------------------------------+
int FindOrCreateLevel(double price, int type, datetime time)
{
   double threshold = PipsToPrice(InpThresholdPips);

   for(int i = 0; i < g_levelCount; i++)
   {
      if(g_levels[i].type == type && g_levels[i].active && !g_levels[i].swept)
      {
         if(MathAbs(g_levels[i].price - price) <= threshold)
         {
            g_levels[i].count++;
            g_levels[i].lastTime = time;
            return i;
         }
      }
   }

   //--- create new level
   if(g_levelCount < InpMaxLevels * 3)  // allow extra for swept
   {
      ArrayResize(g_levels, g_levelCount + 1);
      g_levels[g_levelCount].price     = price;
      g_levels[g_levelCount].count     = 1;
      g_levels[g_levelCount].type      = type;
      g_levels[g_levelCount].firstTime = time;
      g_levels[g_levelCount].lastTime  = time;
      g_levels[g_levelCount].swept     = false;
      g_levels[g_levelCount].active    = true;
      g_levelCount++;
      return g_levelCount - 1;
   }
   return -1;
}

//+------------------------------------------------------------------+
//| Draw a dashed horizontal line                                       |
//+------------------------------------------------------------------+
void DrawLevelLine(string prefix, int index, double price, color clr, bool swept, datetime time1, datetime time2)
{
   string name = prefix + IntegerToString(index);

   ObjectDelete(0, name);
   ObjectCreate(0, name, OBJ_TREND, 0, time1, price, time2, price);
   ObjectSetInteger(0, name, OBJPROP_COLOR, swept ? InpSweptColor : clr);
   ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_DASH);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, swept ? 1 : 2);
   ObjectSetInteger(0, name, OBJPROP_RAY_RIGHT, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);

   if(swept)
   {
      ObjectSetInteger(0, name, OBJPROP_BACK, true);
   }
}

//+------------------------------------------------------------------+
//| Draw label with count and liquidity info                           |
//+------------------------------------------------------------------+
void DrawLevelLabel(string prefix, int index, double price, int type, int count, bool swept,
                    datetime time, double bid, bool showLiq, bool showDist)
{
   string labelPrefix = (type == 1) ? "EQH_BSL_" : "EQL_SSL_";
   string name = labelPrefix + IntegerToString(index);

   ObjectDelete(0, name);

   string typeStr = (type == 1) ? "EQH" : "EQL";
   string text = typeStr + " x" + IntegerToString(count);

   if(showLiq)
   {
      if(type == 1 && price > bid)
         text += " | BSL";
      else if(type == -1 && price < bid)
         text += " | SSL";
   }

   if(showDist)
   {
      double dist = MathAbs(price - bid);
      string distStr;
      if(_Digits == 3 || _Digits == 5)
         distStr = DoubleToString(dist / _Point / 10.0, 1) + " pips";
      else
         distStr = DoubleToString(dist / _Point, 1) + " pips";
      text += " [" + distStr + "]";
   }

   color clr = (type == 1) ? InpEQHColor : InpEQLColor;
   if(swept)
      clr = InpSweptColor;

   ObjectCreate(0, name, OBJ_TEXT, 0, time, price);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetString(0, name, OBJPROP_FONT, "Arial Bold");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, InpFontSize);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_ANCHOR, ANCHOR_LEFT_LOWER);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
}

//+------------------------------------------------------------------+
//| Draw rectangle zone between levels                                  |
//+------------------------------------------------------------------+
void DrawZoneRectangle(string prefix, int index, double priceTop, double priceBot,
                       datetime time1, datetime time2, bool swept)
{
   string name = prefix + "RECT_" + IntegerToString(index);
   ObjectDelete(0, name);

   color clr = swept ? InpSweptColor : clrDarkSlateGray;
   if(prefix == "EQL_")
      clr = swept ? InpSweptColor : clrDarkGreen;

   ObjectCreate(0, name, OBJ_RECTANGLE, 0, time1, priceTop, time2, priceBot);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_FILL, true);
   ObjectSetInteger(0, name, OBJPROP_BACK, true);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);

   if(swept)
      ObjectSetInteger(0, name, OBJPROP_FILL, false);
}

//+------------------------------------------------------------------+
//| Count active (non-swept) levels of given type                      |
//+------------------------------------------------------------------+
int CountActiveLevels(int type)
{
   int count = 0;
   for(int i = 0; i < g_levelCount; i++)
   {
      if(g_levels[i].active && !g_levels[i].swept && g_levels[i].type == type)
         count++;
   }
   return count;
}

//+------------------------------------------------------------------+
//| Enforce max visible levels - mark oldest as inactive                |
//+------------------------------------------------------------------+
void EnforceMaxLevels(int type)
{
   int active = 0;
   //--- count from oldest (index 0 is oldest)
   for(int i = 0; i < g_levelCount; i++)
   {
      if(g_levels[i].active && !g_levels[i].swept && g_levels[i].type == type)
      {
         active++;
         if(active > InpMaxLevels)
         {
            g_levels[i].active = false;
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Main calculation function                                          |
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
   if(rates_total < InpLookback + InpSwingStrength * 2)
      return 0;

   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(bid <= 0)
      bid = close[rates_total - 1];

   int lookbackStart = rates_total - InpLookback;

   //=== Phase 1: Detect swing highs and lows ===
   for(int i = lookbackStart + InpSwingStrength; i < rates_total - InpSwingStrength; i++)
   {
      if(IsSwingHigh(high, i, InpSwingStrength, rates_total))
      {
         FindOrCreateLevel(high[i], 1, time[i]);
      }
      if(IsSwingLow(low, i, InpSwingStrength, rates_total))
      {
         FindOrCreateLevel(low[i], -1, time[i]);
      }
   }

   //=== Phase 2: Check for swept levels (price broke through) ===
   datetime currentTime = time[rates_total - 1];
   for(int i = 0; i < g_levelCount; i++)
   {
      if(!g_levels[i].active || g_levels[i].swept)
         continue;

      //--- scan recent bars for breakout
      for(int b = rates_total - 1; b >= rates_total - 5 && b >= 0; b--)
      {
         if(g_levels[i].type == 1 && close[b] > g_levels[i].price + PipsToPrice(InpThresholdPips))
         {
            g_levels[i].swept = true;
            break;
         }
         if(g_levels[i].type == -1 && close[b] < g_levels[i].price - PipsToPrice(InpThresholdPips))
         {
            g_levels[i].swept = true;
            break;
         }
      }
   }

   //=== Phase 3: Enforce max levels per type ===
   EnforceMaxLevels(1);
   EnforceMaxLevels(-1);

   //=== Phase 4: Draw all levels ===
   datetime drawStart = time[0];
   datetime drawEnd   = currentTime + PeriodSeconds() * 5;

   //--- sweep detection zone
   datetime sweepEnd = currentTime;

   for(int i = 0; i < g_levelCount; i++)
   {
      if(!g_levels[i].active)
         continue;

      string prefix = (g_levels[i].type == 1) ? "EQH_" : "EQL_";
      color  lineClr = (g_levels[i].type == 1) ? InpEQHColor : InpEQLColor;

      //--- draw line
      DrawLevelLine(prefix, i, g_levels[i].price, lineClr, g_levels[i].swept,
                     g_levels[i].firstTime, drawEnd);

      //--- draw label
      DrawLevelLabel(prefix, i, g_levels[i].price, g_levels[i].type,
                     g_levels[i].count, g_levels[i].swept,
                     g_levels[i].lastTime + PeriodSeconds() * 2,
                     bid, InpShowLiquidity, InpShowDistance);

      //--- draw zone rectangle for swept levels (fading zone)
      if(g_levels[i].swept && InpShowRectangles)
      {
         double rectTop = g_levels[i].price;
         double rectBot = g_levels[i].price - PipsToPrice(InpThresholdPips) * 0.5;
         if(g_levels[i].type == -1)
            rectBot = g_levels[i].price + PipsToPrice(InpThresholdPips) * 0.5;

         DrawZoneRectangle(prefix, i, MathMax(rectTop, rectBot), MathMin(rectTop, rectBot),
                           g_levels[i].firstTime, g_levels[i].lastTime + PeriodSeconds() * 3,
                           true);
      }
   }

   //=== Phase 5: Draw zone rectangles between active EQH/EQL pairs ===
   //--- find closest active EQH and EQL for zone drawing
   if(InpShowRectangles)
   {
      int closestEQH = -1, closestEQL = -1;
      double minDistEQH = DBL_MAX, minDistEQL = DBL_MAX;

      for(int i = 0; i < g_levelCount; i++)
      {
         if(!g_levels[i].active || g_levels[i].swept)
            continue;

         double dist = MathAbs(g_levels[i].price - bid);

         if(g_levels[i].type == 1 && dist < minDistEQH)
         {
            minDistEQH = dist;
            closestEQH = i;
         }
         if(g_levels[i].type == -1 && dist < minDistEQL)
         {
            minDistEQL = dist;
            closestEQL = i;
         }
      }

      //--- draw zone between nearest EQH and EQL
      if(closestEQH >= 0 && closestEQL >= 0)
      {
         double top = g_levels[closestEQH].price;
         double bot = g_levels[closestEQL].price;
         if(top > bot)
         {
            string zoneName = "EQH_RECT_zone";
            ObjectDelete(0, zoneName);
            ObjectCreate(0, zoneName, OBJ_RECTANGLE, 0,
                         g_levels[closestEQL].firstTime, top,
                         currentTime, bot);
            ObjectSetInteger(0, zoneName, OBJPROP_COLOR, clrDarkSlateGray);
            ObjectSetInteger(0, zoneName, OBJPROP_FILL, true);
            ObjectSetInteger(0, zoneName, OBJPROP_BACK, true);
            ObjectSetInteger(0, zoneName, OBJPROP_SELECTABLE, false);
            ObjectSetInteger(0, zoneName, OBJPROP_WIDTH, 1);
            ObjectSetInteger(0, zoneName, OBJPROP_STYLE, STYLE_DOT);
         }
      }
   }

   //--- cleanup old inactive objects
   static int cleanupCounter = 0;
   cleanupCounter++;
   if(cleanupCounter % 100 == 0)
   {
      for(int i = 0; i < g_levelCount; i++)
      {
         if(!g_levels[i].active)
         {
            ObjectsDeleteAll(0, "EQH_" + IntegerToString(i), -1, -1);
            ObjectsDeleteAll(0, "EQL_" + IntegerToString(i), -1, -1);
            ObjectsDeleteAll(0, "EQH_BSL_" + IntegerToString(i), -1, -1);
            ObjectsDeleteAll(0, "EQL_SSL_" + IntegerToString(i), -1, -1);
            ObjectsDeleteAll(0, "EQH_RECT_" + IntegerToString(i), -1, -1);
            ObjectsDeleteAll(0, "EQL_RECT_" + IntegerToString(i), -1, -1);
         }
      }
   }

   return rates_total;
}
//+------------------------------------------------------------------+
