//+------------------------------------------------------------------+
//|                                       Order_Block_Indicator.mq5  |
//|                              Order Block Detection & Visualization|
//|                           ICT-style institutional order block zones |
//+------------------------------------------------------------------+
#property copyright "Aegis Terminal"
#property link      ""
#property version   "1.00"
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

//--- Input Parameters
input double   Displacement_ATR_Multiple = 1.5;    // Displacement ATR Multiple
input int      ATR_Period                = 14;      // ATR Period
input int      Lookback_Bars             = 100;     // Lookback Bars
input int      Max_OB_Display            = 5;       // Max OBs to Display
input int      SwingLookback             = 3;       // Swing Confirmation Lookback
input color    BullOB_Color              = clrLime;  // Bullish OB Color
input color    BearOB_Color              = clrRed;   // Bearish OB Color
input color    Mitigated_Color           = clrGray;  // Mitigated OB Color
input int      BullOB_BorderWidth        = 1;       // Bullish OB Border Width
input int      BearOB_BorderWidth        = 1;       // Bearish OB Border Width

//--- Structure for Order Block data
struct OrderBlock
{
   int      barIndex;        // Bar index where OB was formed
   double   openPrice;       // OB candle open
   double   closePrice;      // OB candle close
   double   highPrice;       // OB candle high
   double   lowPrice;        // OB candle low
   datetime time;            // OB candle time
   bool     isBullish;       // Bullish or Bearish OB
   bool     isMitigated;     // Has price returned to OB zone
   double   atrAtFormation;  // ATR at time of formation
   string   objPrefix;       // Unique prefix for drawing objects
};

//--- Global variables
OrderBlock  g_obArray[];
int         g_atrHandle;
int         g_obCount;
datetime    g_lastBarTime;
bool        g_initialScan;

//+------------------------------------------------------------------+
//| Custom indicator initialization function                         |
//+------------------------------------------------------------------+
int OnInit()
{
   //--- Validate inputs
   if(ATR_Period < 1)
   {
      Print("Error: ATR_Period must be >= 1");
      return(INIT_PARAMETERS_INCORRECT);
   }
   if(Lookback_Bars < 10)
   {
      Print("Error: Lookback_Bars must be >= 10");
      return(INIT_PARAMETERS_INCORRECT);
   }
   if(Max_OB_Display < 1 || Max_OB_Display > 20)
   {
      Print("Error: Max_OB_Display must be 1-20");
      return(INIT_PARAMETERS_INCORRECT);
   }
   if(Displacement_ATR_Multiple < 0.5)
   {
      Print("Error: Displacement_ATR_Multiple must be >= 0.5");
      return(INIT_PARAMETERS_INCORRECT);
   }

   //--- Initialize ATR
   g_atrHandle = iATR(_Symbol, PERIOD_CURRENT, ATR_Period);
   if(g_atrHandle == INVALID_HANDLE)
   {
      Print("Error creating ATR indicator");
      return(INIT_FAILED);
   }

   //--- Initialize state
   g_obCount     = 0;
   g_lastBarTime = 0;
   g_initialScan = true;

   ArrayResize(g_obArray, 0);

   //--- Remove any stale objects from previous runs
   ObjectsDeleteAll(0, "OB_");

   Print("Order Block Indicator initialized. ATR Period=", ATR_Period,
         " Displacement=", Displacement_ATR_Multiple, "x ATR",
         " Lookback=", Lookback_Bars, " MaxOBs=", Max_OB_Display);

   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Custom indicator deinitialization function                       |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   //--- Remove all drawing objects
   ObjectsDeleteAll(0, "OB_");

   //--- Release ATR handle
   if(g_atrHandle != INVALID_HANDLE)
      IndicatorRelease(g_atrHandle);

   Comment("");
}

//+------------------------------------------------------------------+
//| Custom indicator iteration function                              |
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
   //--- Not enough bars
   if(rates_total < ATR_Period + SwingLookback + 2)
      return(0);

   //--- Get ATR values
   double atrBuffer[];
   ArraySetAsSeries(atrBuffer, true);
   if(CopyBuffer(g_atrHandle, 0, 0, rates_total, atrBuffer) <= 0)
      return(0);

   //--- Set price arrays as series (index 0 = current bar)
   ArraySetAsSeries(open, true);
   ArraySetAsSeries(high, true);
   ArraySetAsSeries(low, true);
   ArraySetAsSeries(close, true);
   ArraySetAsSeries(time, true);

   //--- Track mitigation for existing OBs
   UpdateMitigationStatus(close, high, low, atrBuffer, rates_total);

   //--- Remove old OBs beyond lookback
   RemoveOldOBs(time, rates_total);

   //--- On first run or new bar: scan for OBs
   datetime currentBarTime = time[0];
   bool newBar = (currentBarTime != g_lastBarTime);

   if(g_initialScan || newBar)
   {
      g_lastBarTime = currentBarTime;

      //--- Scan from lookback distance back to SwingLookback+1 bars
      int scanLimit = MathMin(rates_total - 2, Lookback_Bars);
      for(int i = SwingLookback + 1; i < scanLimit; i++)
      {
         //--- Skip if too many OBs
         if(g_obCount >= Max_OB_Display)
            break;

         //--- Skip if already detected at this bar
         if(IsBarAlreadyDetected(i))
            continue;

         //--- Check for displacement candle (strong move)
         double displacementBody = MathAbs(close[i-1] - open[i-1]);
         double atrThreshold     = atrBuffer[i-1] * Displacement_ATR_Multiple;

         if(displacementBody < atrThreshold)
            continue;

         //--- Detect Bullish OB: bearish candle before strong bullish move
         if(close[i-1] > open[i-1] && close[i] < open[i])
         {
            if(IsSwingHigh(open, close, i, SwingLookback))
            {
               RegisterBullishOB(i, open, close, high, low, time, atrBuffer[i]);
            }
         }
         //--- Detect Bearish OB: bullish candle before strong bearish move
         else if(close[i-1] < open[i-1] && close[i] > open[i])
         {
            if(IsSwingLow(open, close, i, SwingLookback))
            {
               RegisterBearishOB(i, open, close, high, low, time, atrBuffer[i]);
            }
         }
      }

      g_initialScan = false;

      //--- Redraw all OB visuals
      RedrawAllOBs();
   }

   //--- Update right edge of OB rectangles for fresh OBs
   UpdateOBRightEdge(time);

   return(rates_total);
}

//+------------------------------------------------------------------+
//| Check if bar is already registered as an OB                      |
//+------------------------------------------------------------------+
bool IsBarAlreadyDetected(int barIndex)
{
   for(int i = 0; i < g_obCount; i++)
   {
      if(g_obArray[i].barIndex == barIndex)
         return true;
   }
   return false;
}

//+------------------------------------------------------------------+
//| Confirm swing high (price higher than N candles on each side)    |
//+------------------------------------------------------------------+
bool IsSwingHigh(const double &open[], const double &close[], int index, int lookback)
{
   double obHigh = MathMax(open[index], close[index]);

   for(int j = 1; j <= lookback; j++)
   {
      if(index - j < 0) return false;
      if(index + j >= ArraySize(open)) return false;

      double leftHigh  = MathMax(open[index-j], close[index-j]);
      double rightHigh = MathMax(open[index+j], close[index+j]);

      if(obHigh <= leftHigh || obHigh <= rightHigh)
         return false;
   }
   return true;
}

//+------------------------------------------------------------------+
//| Confirm swing low (price lower than N candles on each side)      |
//+------------------------------------------------------------------+
bool IsSwingLow(const double &open[], const double &close[], int index, int lookback)
{
   double obLow = MathMin(open[index], close[index]);

   for(int j = 1; j <= lookback; j++)
   {
      if(index - j < 0) return false;
      if(index + j >= ArraySize(open)) return false;

      double leftLow  = MathMin(open[index-j], close[index-j]);
      double rightLow = MathMin(open[index+j], close[index+j]);

      if(obLow >= leftLow || obLow >= rightLow)
         return false;
   }
   return true;
}

//+------------------------------------------------------------------+
//| Register a Bullish Order Block                                   |
//+------------------------------------------------------------------+
void RegisterBullishOB(int barIndex, const double &open[], const double &close[],
                       const double &high[], const double &low[],
                       const datetime &time[], double atrValue)
{
   //--- Grow array if needed
   if(g_obCount >= ArraySize(g_obArray))
      ArrayResize(g_obArray, g_obCount + 1);

   //--- Fill OB struct
   g_obArray[g_obCount].barIndex      = barIndex;
   g_obArray[g_obCount].openPrice     = open[barIndex];
   g_obArray[g_obCount].closePrice    = close[barIndex];
   g_obArray[g_obCount].highPrice     = high[barIndex];
   g_obArray[g_obCount].lowPrice      = low[barIndex];
   g_obArray[g_obCount].time          = time[barIndex];
   g_obArray[g_obCount].isBullish     = true;
   g_obArray[g_obCount].isMitigated   = false;
   g_obArray[g_obCount].atrAtFormation = atrValue;
   g_obArray[g_obCount].objPrefix     = "OB_BULL_" + IntegerToString(g_obCount);

   g_obCount++;
}

//+------------------------------------------------------------------+
//| Register a Bearish Order Block                                   |
//+------------------------------------------------------------------+
void RegisterBearishOB(int barIndex, const double &open[], const double &close[],
                       const double &high[], const double &low[],
                       const datetime &time[], double atrValue)
{
   if(g_obCount >= ArraySize(g_obArray))
      ArrayResize(g_obArray, g_obCount + 1);

   g_obArray[g_obCount].barIndex      = barIndex;
   g_obArray[g_obCount].openPrice     = open[barIndex];
   g_obArray[g_obCount].closePrice    = close[barIndex];
   g_obArray[g_obCount].highPrice     = high[barIndex];
   g_obArray[g_obCount].lowPrice      = low[barIndex];
   g_obArray[g_obCount].time          = time[barIndex];
   g_obArray[g_obCount].isBullish     = false;
   g_obArray[g_obCount].isMitigated   = false;
   g_obArray[g_obCount].atrAtFormation = atrValue;
   g_obArray[g_obCount].objPrefix     = "OB_BEAR_" + IntegerToString(g_obCount);

   g_obCount++;
}

//+------------------------------------------------------------------+
//| Update mitigation status for all tracked OBs                     |
//+------------------------------------------------------------------+
void UpdateMitigationStatus(const double &close[], const double &high[],
                            const double &low[], const double &atrBuffer[],
                            int rates_total)
{
   for(int i = 0; i < g_obCount; i++)
   {
      if(g_obArray[i].isMitigated)
         continue;

      double obTop = MathMax(g_obArray[i].openPrice, g_obArray[i].closePrice);
      double obBot = MathMin(g_obArray[i].openPrice, g_obArray[i].closePrice);

      //--- Check recent bars (last 5 bars) for mitigation
      for(int j = 0; j < 5 && j < rates_total; j++)
      {
         bool mitigated = false;

         //--- Bullish OB mitigated when price dips back into the zone
         if(g_obArray[i].isBullish)
         {
            if(low[j] <= obTop && low[j] >= obBot)
               mitigated = true;
            else if(low[j] < obBot)
               mitigated = true;
         }
         //--- Bearish OB mitigated when price rallies back into the zone
         else
         {
            if(high[j] >= obBot && high[j] <= obTop)
               mitigated = true;
            else if(high[j] > obTop)
               mitigated = true;
         }

         if(mitigated)
         {
            g_obArray[i].isMitigated = true;
            break;
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Remove OBs older than max lookback                              |
//+------------------------------------------------------------------+
void RemoveOldOBs(const datetime &time[], int rates_total)
{
   if(rates_total < Lookback_Bars)
      return;

   datetime cutoffTime = time[Lookback_Bars - 1];

   int writeIndex = 0;
   for(int i = 0; i < g_obCount; i++)
   {
      if(g_obArray[i].time < cutoffTime)
      {
         //--- Delete drawing objects
         ObjectDelete(0, g_obArray[i].objPrefix + "_rect");
         ObjectDelete(0, g_obArray[i].objPrefix + "_label");
         ObjectDelete(0, g_obArray[i].objPrefix + "_str");
         continue;
      }

      //--- Compact array
      if(writeIndex != i)
         g_obArray[writeIndex] = g_obArray[i];
      writeIndex++;
   }
   g_obCount = writeIndex;
}

//+------------------------------------------------------------------+
//| Redraw all OB rectangles and labels                              |
//+------------------------------------------------------------------+
void RedrawAllOBs()
{
   for(int i = 0; i < g_obCount; i++)
   {
      CreateOBGraphics(i);
   }
}

//+------------------------------------------------------------------+
//| Create rectangle + label + strength text for one OB              |
//+------------------------------------------------------------------+
void CreateOBGraphics(int obIndex)
{
   OrderBlock &ob = g_obArray[obIndex];

   double obTop = MathMax(ob.openPrice, ob.closePrice);
   double obBot = MathMin(ob.openPrice, ob.closePrice);

   //--- Determine colors based on mitigation
   color rectColor;
   color borderColor;
   int   bgAlpha;
   int   borderAlpha;

   if(ob.isMitigated)
   {
      rectColor  = Mitigated_Color;
      borderColor = clrDarkGray;
      bgAlpha    = 80;   // low opacity = faded
      borderAlpha = 60;
   }
   else
   {
      rectColor   = ob.isBullish ? BullOB_Color : BearOB_Color;
      borderColor = ob.isBullish ? clrDarkGreen : clrDarkRed;
      bgAlpha     = 220;  // high opacity = fresh
      borderAlpha = 200;
   }

   //--- Rectangle name
   string rectName = ob.objPrefix + "_rect";

   //--- Remove old if exists
   ObjectDelete(0, rectName);

   //--- Create rectangle
   ObjectCreate(0, rectName, OBJ_RECTANGLE, 0, ob.time, obTop, TimeCurrent(), obBot);

   //--- Style the rectangle
   ObjectSetInteger(0, rectName, OBJPROP_COLOR, rectColor);
   ObjectSetInteger(0, rectName, OBJPROP_BGCOLOR, rectColor);
   ObjectSetInteger(0, rectName, OBJPROP_STYLE, STYLE_SOLID);
   ObjectSetInteger(0, rectName, OBJPROP_WIDTH, ob.isBullish ? BullOB_BorderWidth : BearOB_BorderWidth);
   ObjectSetInteger(0, rectName, OBJPROP_FILL, true);
   ObjectSetInteger(0, rectName, OBJPROP_BACK, false);     // show in foreground
   ObjectSetInteger(0, rectName, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, rectName, OBJPROP_HIDDEN, true);    // hide from object list

   //--- Set background transparency
   ObjectSetInteger(0, rectName, OBJPROP_COLOR, clrNONE);
   ObjectSetInteger(0, rectName, OBJPROP_BGCOLOR, rectColor);

   //--- Label name: "Bull OB" / "Bear OB" + price
   string labelName = ob.objPrefix + "_label";
   string labelText;
   if(ob.isBullish)
      labelText = "Bull OB @ " + DoubleToString(obBot, _Digits);
   else
      labelText = "Bear OB @ " + DoubleToString(obTop, _Digits);

   ObjectDelete(0, labelName);
   ObjectCreate(0, labelName, OBJ_TEXT, 0, ob.time, obTop + (obTop - obBot) * 0.1);
   ObjectSetString(0, labelName, OBJPROP_TEXT, labelText);
   ObjectSetInteger(0, labelName, OBJPROP_COLOR, ob.isBullish ? clrLime : clrRed);
   ObjectSetInteger(0, labelName, OBJPROP_FONTSIZE, 8);
   ObjectSetString(0, labelName, OBJPROP_FONT, "Arial Bold");
   ObjectSetInteger(0, labelName, OBJPROP_ANCHOR, ANCHOR_LEFT_LOWER);
   ObjectSetInteger(0, labelName, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, labelName, OBJPROP_HIDDEN, true);

   //--- Strength text: "Strong" or "Moderate"
   string strName = ob.objPrefix + "_str";
   string strengthText = GetStrengthLabel(ob);

   ObjectDelete(0, strName);
   ObjectCreate(0, strName, OBJ_TEXT, 0, ob.time, obBot - (obTop - obBot) * 0.1);
   ObjectSetString(0, strName, OBJPROP_TEXT, strengthText);
   ObjectSetInteger(0, strName, OBJPROP_COLOR, ob.isBullish ? clrGreen : clrOrangeRed);
   ObjectSetInteger(0, strName, OBJPROP_FONTSIZE, 7);
   ObjectSetString(0, strName, OBJPROP_FONT, "Arial");
   ObjectSetInteger(0, strName, OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
   ObjectSetInteger(0, strName, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, strName, OBJPROP_HIDDEN, true);
}

//+------------------------------------------------------------------+
//| Determine OB strength based on proximity to price                |
//+------------------------------------------------------------------+
string GetStrengthLabel(const OrderBlock &ob)
{
   double obTop = MathMax(ob.openPrice, ob.closePrice);
   double obBot = MathMin(ob.openPrice, ob.closePrice);
   double obMid = (obTop + obBot) / 2.0;

   double currentPrice = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double atrNow = GetLatestATR();

   if(atrNow <= 0) atrNow = ob.atrAtFormation;
   if(atrNow <= 0) atrNow = 1.0;

   double distToOB = MathAbs(currentPrice - obMid);
   double atrMultiple = distToOB / atrNow;

   string status = ob.isMitigated ? " [Mitigated]" : "";

   if(atrMultiple <= 1.0)
      return "Strong" + status;
   else
      return "Moderate" + status;
}

//+------------------------------------------------------------------+
//| Get latest ATR value from buffer                                 |
//+------------------------------------------------------------------+
double GetLatestATR()
{
   double buf[];
   if(CopyBuffer(g_atrHandle, 0, 0, 1, buf) == 1)
      return buf[0];
   return 0.0;
}

//+------------------------------------------------------------------+
//| Update right edge of rectangles to current time                  |
//+------------------------------------------------------------------+
void UpdateOBRightEdge(const datetime &time[])
{
   datetime now = TimeCurrent();

   for(int i = 0; i < g_obCount; i++)
   {
      string rectName = g_obArray[i].objPrefix + "_rect";
      if(ObjectFind(0, rectName) >= 0)
      {
         //--- Update the second time coordinate (right edge)
         ObjectSetInteger(0, rectName, OBJPROP_TIME, 1, now);

         //--- Update mitigation opacity
         if(g_obArray[i].isMitigated)
         {
            ObjectSetInteger(0, rectName, OBJPROP_BGCOLOR, Mitigated_Color);
            ObjectSetInteger(0, rectName, OBJPROP_COLOR, clrNONE);

            //--- Update strength label
            string strName = g_obArray[i].objPrefix + "_str";
            if(ObjectFind(0, strName) >= 0)
               ObjectSetString(0, strName, OBJPROP_TEXT, GetStrengthLabel(g_obArray[i]));
         }
      }
   }

   //--- Update comment with OB count
   int freshCount = 0;
   int mitigatedCount = 0;
   for(int i = 0; i < g_obCount; i++)
   {
      if(g_obArray[i].isMitigated)
         mitigatedCount++;
      else
         freshCount++;
   }

   Comment("Order Blocks: " + IntegerToString(freshCount) + " fresh, " +
           IntegerToString(mitigatedCount) + " mitigated | " +
           _Symbol + " " + EnumToString(Period()));
}
//+------------------------------------------------------------------+
