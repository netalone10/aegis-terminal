//+------------------------------------------------------------------+
//|                                            Risk_Calculator.mq5   |
//|                    ICT-Style Risk Management EA                   |
//|                   One-Click Lot Sizing Calculator                 |
//+------------------------------------------------------------------+
#property copyright "Aegis Terminal"
#property link      ""
#property version   "1.00"
#property strict

#include <Trade/Trade.mqh>

//+------------------------------------------------------------------+
//| Input Parameters                                                  |
//+------------------------------------------------------------------+
input group "=== Risk Settings ==="
input double Risk_Percentage   = 1.0;    // Risk per trade (%)
input int    Magic_Number      = 123456; // Magic number
input int    Max_Spread        = 30;     // Max spread (points)
input double ATR_Multiplier_In = 1.0;    // ATR multiplier for SL (0.5/0.75/1.0/1.5)
input bool   Use_ATR_SL_In     = false;  // Use ATR for SL instead of manual pips
input int    ATR_Period        = 14;     // ATR period
input ENUM_TIMEFRAMES ATR_TF   = PERIOD_CURRENT; // ATR timeframe

input group "=== Visual Settings ==="
input color  Panel_BG          = C'25,25,35';       // Panel background
input color  Panel_Border      = C'60,60,80';       // Panel border
input color  Text_Color        = C'200,200,210';    // Text color
input color  Accent_Green      = C'0,180,100';      // Green accent
input color  Accent_Red        = C'220,50,50';      // Red accent
input color  Accent_Gold       = C'255,200,50';     // Gold accent
input color  Button_BG         = C'40,40,55';       // Button background
input color  Button_Hover      = C'60,60,80';       // Button hover
input int    Font_Size         = 9;                 // Font size
input string Font_Name         = "Consolas";        // Font name

//+------------------------------------------------------------------+
//| Global Variables                                                  |
//+------------------------------------------------------------------+
CTrade trade;

// Panel dimensions
#define PANEL_X      30
#define PANEL_Y      30
#define PANEL_WIDTH  280
#define PANEL_HEIGHT 420

// Object name prefixes
#define OBJ_PREFIX   "RC_"

// State
double g_risk_pct      = 1.0;
double g_sl_pips       = 20.0;
double g_calculated_lot = 0.0;
double g_potential_loss = 0.0;
bool   g_panel_visible  = true;
int    g_atr_handle    = INVALID_HANDLE;
double g_atr_multiplier = 1.0;
bool   g_use_atr_sl     = false;

//+------------------------------------------------------------------+
//| Expert initialization function                                    |
//+------------------------------------------------------------------+
int OnInit()
{
   // Initialize trade object
   trade.SetExpertMagicNumber(Magic_Number);
   trade.SetDeviationInPoints(10);
   trade.SetTypeFilling(ORDER_FILLING_IOC);

   // Init runtime state from inputs
   g_use_atr_sl = Use_ATR_SL_In;
   g_atr_multiplier = ATR_Multiplier_In;

   // Initialize ATR if needed
   if(g_use_atr_sl)
   {
      g_atr_handle = iATR(_Symbol, ATR_TF, ATR_Period);
      if(g_atr_handle == INVALID_HANDLE)
      {
         Print("Risk_Calculator: Failed to create ATR indicator");
         return(INIT_FAILED);
      }
   }

   // Create the panel
   CreatePanel();

   Print("Risk_Calculator initialized | Magic: ", Magic_Number,
         " | Risk: ", Risk_Percentage, "% | Max Spread: ", Max_Spread);

   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   DeletePanel();

   if(g_atr_handle != INVALID_HANDLE)
      IndicatorRelease(g_atr_handle);

   Print("Risk_Calculator deinitialized. Reason: ", reason);
}

//+------------------------------------------------------------------+
//| Expert tick function                                              |
//+------------------------------------------------------------------+
void OnTick()
{
   if(!g_panel_visible) return;

   // Update displayed values every tick
   UpdatePanelValues();
}

//+------------------------------------------------------------------+
//| Chart event function                                              |
//+------------------------------------------------------------------+
void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   if(id == CHARTEVENT_OBJECT_CLICK)
   {
      HandleButtonClick(sparam);
   }
   else if(id == CHARTEVENT_OBJECT_ENDEDIT)
   {
      HandleEditEnd(sparam);
   }
   else if(id == CHARTEVENT_CHART_CHANGE)
   {
      // Keep panel visible on chart resize
   }
}

//+------------------------------------------------------------------+
//| Create the entire panel                                           |
//+------------------------------------------------------------------+
void CreatePanel()
{
   // Main background
   CreateRect(OBJ_PREFIX + "BG", PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, Panel_BG);
   CreateRectBorder(OBJ_PREFIX + "Border", PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, Panel_Border);

   // Title
   CreateLabel(OBJ_PREFIX + "Title", PANEL_X + 10, PANEL_Y + 8,
               "ICT RISK CALCULATOR", Accent_Gold, Font_Size + 1, true);

   // Separator line
   CreateRect(OBJ_PREFIX + "Sep1", PANEL_X + 10, PANEL_Y + 32,
              PANEL_WIDTH - 20, 1, Panel_Border);

   // Account Balance
   CreateLabel(OBJ_PREFIX + "BalanceLabel", PANEL_X + 10, PANEL_Y + 42,
               "Account Balance:", Text_Color, Font_Size);
   CreateLabel(OBJ_PREFIX + "BalanceValue", PANEL_X + PANEL_WIDTH - 10, PANEL_Y + 42,
               "$0.00", Accent_Gold, Font_Size, true, true);

   // Risk % (editable)
   CreateLabel(OBJ_PREFIX + "RiskLabel", PANEL_X + 10, PANEL_Y + 65,
               "Risk Percentage:", Text_Color, Font_Size);
   CreateEdit(OBJ_PREFIX + "RiskEdit", PANEL_X + PANEL_WIDTH - 90, PANEL_Y + 62,
              80, 20, DoubleToString(Risk_Percentage, 1));
   CreateLabel(OBJ_PREFIX + "RiskPct", PANEL_X + PANEL_WIDTH - 10, PANEL_Y + 65,
               "%", Text_Color, Font_Size, false, true);

   // Separator
   CreateRect(OBJ_PREFIX + "Sep2", PANEL_X + 10, PANEL_Y + 90,
              PANEL_WIDTH - 20, 1, Panel_Border);

   // Risk Preset Buttons
   CreateLabel(OBJ_PREFIX + "PresetLabel", PANEL_X + 10, PANEL_Y + 98,
               "Quick Presets:", Text_Color, Font_Size - 1);
   CreateButton(OBJ_PREFIX + "Preset05", PANEL_X + 10,  PANEL_Y + 118, 58, 22,
                "0.5%", Button_BG, Text_Color);
   CreateButton(OBJ_PREFIX + "Preset1",  PANEL_X + 74,  PANEL_Y + 118, 58, 22,
                "1.0%", Accent_Gold, Panel_BG);
   CreateButton(OBJ_PREFIX + "Preset2",  PANEL_X + 138, PANEL_Y + 118, 58, 22,
                "2.0%", Button_BG, Text_Color);
   CreateButton(OBJ_PREFIX + "Preset3",  PANEL_X + 202, PANEL_Y + 118, 58, 22,
                "3.0%", Button_BG, Text_Color);

   // Separator
   CreateRect(OBJ_PREFIX + "Sep3", PANEL_X + 10, PANEL_Y + 148,
              PANEL_WIDTH - 20, 1, Panel_Border);

   // SL Section
   CreateLabel(OBJ_PREFIX + "SLSectionLabel", PANEL_X + 10, PANEL_Y + 155,
               "Stop Loss", Accent_Gold, Font_Size, true);

   // ATR toggle
   CreateButton(OBJ_PREFIX + "ATRToggle", PANEL_X + 10, PANEL_Y + 175, 120, 22,
                "Manual Pips", Button_BG, Text_Color);

   // Manual SL input
   CreateLabel(OBJ_PREFIX + "SLLabel", PANEL_X + 10, PANEL_Y + 205,
               "SL Pips:", Text_Color, Font_Size);
   CreateEdit(OBJ_PREFIX + "SLEdit", PANEL_X + PANEL_WIDTH - 90, PANEL_Y + 202,
              80, 20, DoubleToString(g_sl_pips, 1));

   // ATR multiplier buttons (hidden by default)
   CreateButton(OBJ_PREFIX + "ATR05", PANEL_X + 10,  PANEL_Y + 202, 58, 22,
                "ATR×0.5", Button_BG, Text_Color);
   CreateButton(OBJ_PREFIX + "ATR075", PANEL_X + 74,  PANEL_Y + 202, 58, 22,
                "ATR×0.75", Button_BG, Text_Color);
   CreateButton(OBJ_PREFIX + "ATR1",   PANEL_X + 138, PANEL_Y + 202, 58, 22,
                "ATR×1.0", Button_BG, Text_Color);
   CreateButton(OBJ_PREFIX + "ATR15",  PANEL_X + 202, PANEL_Y + 202, 58, 22,
                "ATR×1.5", Button_BG, Text_Color);

   // ATR value display
   CreateLabel(OBJ_PREFIX + "ATRLabel", PANEL_X + 10, PANEL_Y + 230,
               "ATR Value:", Text_Color, Font_Size);
   CreateLabel(OBJ_PREFIX + "ATRValue", PANEL_X + PANEL_WIDTH - 10, PANEL_Y + 230,
               "N/A", Text_Color, Font_Size, false, true);

   // Show/hide ATR elements based on setting
   SetATRMode(g_use_atr_sl);

   // Separator
   CreateRect(OBJ_PREFIX + "Sep4", PANEL_X + 10, PANEL_Y + 255,
              PANEL_WIDTH - 20, 1, Panel_Border);

   // Calculated values
   CreateLabel(OBJ_PREFIX + "CalcSectionLabel", PANEL_X + 10, PANEL_Y + 262,
               "Trade Size", Accent_Gold, Font_Size, true);

   // Calculated Lot
   CreateLabel(OBJ_PREFIX + "LotLabel", PANEL_X + 10, PANEL_Y + 282,
               "Lot Size:", Text_Color, Font_Size);
   CreateLabel(OBJ_PREFIX + "LotValue", PANEL_X + PANEL_WIDTH - 10, PANEL_Y + 282,
               "0.00", Accent_Green, Font_Size + 1, true, true);

   // Potential Loss
   CreateLabel(OBJ_PREFIX + "LossLabel", PANEL_X + 10, PANEL_Y + 305,
               "Potential Loss:", Text_Color, Font_Size);
   CreateLabel(OBJ_PREFIX + "LossValue", PANEL_X + PANEL_WIDTH - 10, PANEL_Y + 305,
               "$0.00", Accent_Red, Font_Size, true, true);

   // Spread info
   CreateLabel(OBJ_PREFIX + "SpreadLabel", PANEL_X + 10, PANEL_Y + 328,
               "Spread:", Text_Color, Font_Size - 1);
   CreateLabel(OBJ_PREFIX + "SpreadValue", PANEL_X + PANEL_WIDTH - 10, PANEL_Y + 328,
               "0 pts", Text_Color, Font_Size - 1, false, true);

   // Separator
   CreateRect(OBJ_PREFIX + "Sep5", PANEL_X + 10, PANEL_Y + 348,
              PANEL_WIDTH - 20, 1, Panel_Border);

   // BUY Button
   CreateButton(OBJ_PREFIX + "BuyBtn", PANEL_X + 10, PANEL_Y + 360,
                (PANEL_WIDTH - 30) / 2, 40,
                "BUY", Accent_Green, Panel_BG);

   // SELL Button
   CreateButton(OBJ_PREFIX + "SellBtn", PANEL_X + 10 + (PANEL_WIDTH - 30) / 2 + 10,
                PANEL_Y + 360,
                (PANEL_WIDTH - 30) / 2, 40,
                "SELL", Accent_Red, Panel_BG);

   // Initial calculation
   Recalculate();
}

//+------------------------------------------------------------------+
//| Delete all panel objects                                          |
//+------------------------------------------------------------------+
void DeletePanel()
{
   ObjectsDeleteAll(0, OBJ_PREFIX);
}

//+------------------------------------------------------------------+
//| Recalculate lot size and potential loss                           |
//+------------------------------------------------------------------+
void Recalculate()
{
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double risk_amount = balance * (g_risk_pct / 100.0);

   // Get tick info
   double tick_value = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tick_size  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   int    digits     = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);

   // Calculate lot
   if(g_sl_pips <= 0 || tick_value <= 0 || tick_size <= 0)
   {
      g_calculated_lot = 0.0;
      g_potential_loss = 0.0;
   }
   else
   {
      double sl_points = g_sl_pips * GetPipSize() / tick_size;
      double risk_per_lot = sl_points * tick_value;

      if(risk_per_lot > 0)
         g_calculated_lot = NormalizeDouble(risk_amount / risk_per_lot, 2);
      else
         g_calculated_lot = 0.0;

      // Clamp to broker limits
      double min_lot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
      double max_lot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
      double lot_step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

      if(g_calculated_lot < min_lot) g_calculated_lot = min_lot;
      if(g_calculated_lot > max_lot) g_calculated_lot = max_lot;

      // Normalize to lot step
      if(lot_step > 0)
         g_calculated_lot = MathFloor(g_calculated_lot / lot_step) * lot_step;

      g_calculated_lot = NormalizeDouble(g_calculated_lot, 2);

      // Potential loss = risk amount (capped by actual lot)
      g_potential_loss = g_calculated_lot * risk_per_lot;
   }
}

//+------------------------------------------------------------------+
//| Update panel display values                                       |
//+------------------------------------------------------------------+
void UpdatePanelValues()
{
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   int spread = (int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);

   ObjectSetString(0, OBJ_PREFIX + "BalanceValue", OBJPROP_TEXT,
                   "$" + DoubleToString(balance, 2));

   ObjectSetString(0, OBJ_PREFIX + "LotValue", OBJPROP_TEXT,
                   DoubleToString(g_calculated_lot, 2));

   ObjectSetString(0, OBJ_PREFIX + "LossValue", OBJPROP_TEXT,
                   "$" + DoubleToString(g_potential_loss, 2));

   color spread_color = (spread <= Max_Spread) ? Text_Color : Accent_Red;
   ObjectSetString(0, OBJ_PREFIX + "SpreadValue", OBJPROP_TEXT,
                   IntegerToString(spread) + " pts");
   ObjectSetInteger(0, OBJ_PREFIX + "SpreadValue", OBJPROP_COLOR, spread_color);

   // Update ATR value if using ATR
   if(g_use_atr_sl && g_atr_handle != INVALID_HANDLE)
   {
      double atr_buf[];
      if(CopyBuffer(g_atr_handle, 0, 0, 1, atr_buf) == 1)
      {
         double atr_val = atr_buf[0];
         ObjectSetString(0, OBJ_PREFIX + "ATRValue", OBJPROP_TEXT,
                         DoubleToString(atr_val, digits()));
      }
   }

   // Recalculate on tick
   Recalculate();
}

//+------------------------------------------------------------------+
//| Handle button clicks                                              |
//+------------------------------------------------------------------+
void HandleButtonClick(const string name)
{
   // Reset all button states first
   ResetButtonStates();

   // Risk presets
   if(name == OBJ_PREFIX + "Preset05") { g_risk_pct = 0.5; SetActivePreset(name); }
   if(name == OBJ_PREFIX + "Preset1")  { g_risk_pct = 1.0; SetActivePreset(name); }
   if(name == OBJ_PREFIX + "Preset2")  { g_risk_pct = 2.0; SetActivePreset(name); }
   if(name == OBJ_PREFIX + "Preset3")  { g_risk_pct = 3.0; SetActivePreset(name); }

   // Update risk edit field
   if(StringFind(name, "Preset") >= 0)
   {
      ObjectSetString(0, OBJ_PREFIX + "RiskEdit", OBJPROP_TEXT,
                      DoubleToString(g_risk_pct, 1));
      Recalculate();
      ChartRedraw();
      return;
   }

   // ATR mode toggle
   if(name == OBJ_PREFIX + "ATRToggle")
   {
      g_use_atr_sl = !g_use_atr_sl;
      SetATRMode(g_use_atr_sl);
      Recalculate();
      ChartRedraw();
      return;
   }

   // ATR multiplier buttons
   if(name == OBJ_PREFIX + "ATR05")  { g_atr_multiplier = 0.5;  SetActiveATR(name); }
   if(name == OBJ_PREFIX + "ATR075") { g_atr_multiplier = 0.75; SetActiveATR(name); }
   if(name == OBJ_PREFIX + "ATR1")   { g_atr_multiplier = 1.0;  SetActiveATR(name); }
   if(name == OBJ_PREFIX + "ATR15")  { g_atr_multiplier = 1.5;  SetActiveATR(name); }

   if(StringFind(name, "ATR") >= 0 && name != OBJ_PREFIX + "ATRToggle")
   {
      UpdateSLFromATR();
      Recalculate();
      ChartRedraw();
      return;
   }

   // BUY button
   if(name == OBJ_PREFIX + "BuyBtn")
   {
      ExecuteOrder(ORDER_TYPE_BUY);
      return;
   }

   // SELL button
   if(name == OBJ_PREFIX + "SellBtn")
   {
      ExecuteOrder(ORDER_TYPE_SELL);
      return;
   }
}

//+------------------------------------------------------------------+
//| Handle edit field changes                                         |
//+------------------------------------------------------------------+
void HandleEditEnd(const string name)
{
   if(name == OBJ_PREFIX + "RiskEdit")
   {
      string val = ObjectGetString(0, OBJ_PREFIX + "RiskEdit", OBJPROP_TEXT);
      double new_risk = StringToDouble(val);
      if(new_risk > 0 && new_risk <= 100)
      {
         g_risk_pct = new_risk;
         Recalculate();
         ChartRedraw();
      }
      else
      {
         ObjectSetString(0, OBJ_PREFIX + "RiskEdit", OBJPROP_TEXT,
                         DoubleToString(g_risk_pct, 1));
         Print("Risk_Calculator: Invalid risk percentage: ", val);
      }
   }

   if(name == OBJ_PREFIX + "SLEdit")
   {
      string val = ObjectGetString(0, OBJ_PREFIX + "SLEdit", OBJPROP_TEXT);
      double new_sl = StringToDouble(val);
      if(new_sl > 0)
      {
         g_sl_pips = new_sl;
         Recalculate();
         ChartRedraw();
      }
      else
      {
         ObjectSetString(0, OBJ_PREFIX + "SLEdit", OBJPROP_TEXT,
                         DoubleToString(g_sl_pips, 1));
         Print("Risk_Calculator: Invalid SL pips: ", val);
      }
   }
}

//+------------------------------------------------------------------+
//| Execute market order                                              |
//+------------------------------------------------------------------+
void ExecuteOrder(ENUM_ORDER_TYPE order_type)
{
   // Pre-flight checks
   if(!PreFlightCheck()) return;

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);

   // Calculate SL and TP levels
   double sl_distance = g_sl_pips * GetPipValue();
   double tp1_distance = sl_distance; // 1:1 R:R
   double tp2_distance = sl_distance * 2.0; // 2:1 R:R

   double price, sl, tp;

   if(order_type == ORDER_TYPE_BUY)
   {
      price = ask;
      sl = NormalizeDouble(price - sl_distance, digits());
      tp = NormalizeDouble(price + tp2_distance, digits()); // Use TP2
   }
   else
   {
      price = bid;
      sl = NormalizeDouble(price + sl_distance, digits());
      tp = NormalizeDouble(price - tp2_distance, digits()); // Use TP2
   }

   // Build comment
   string comment = StringFormat("RC|Risk%.1f|SL%.0f", g_risk_pct, g_sl_pips);

   // Log the order
   Print("Risk_Calculator ORDER: ", EnumToString(order_type),
         " | Lot: ", g_calculated_lot,
         " | Price: ", price,
         " | SL: ", sl,
         " | TP: ", tp,
         " | Risk: $", DoubleToString(g_potential_loss, 2),
         " | Comment: ", comment);

   // Execute
   bool result = false;
   if(order_type == ORDER_TYPE_BUY)
      result = trade.Buy(g_calculated_lot, _Symbol, price, sl, tp, comment);
   else
      result = trade.Sell(g_calculated_lot, _Symbol, price, sl, tp, comment);

   if(result)
   {
      Print("Risk_Calculator: Order placed successfully. Ticket: ",
            trade.ResultOrder());
      Alert("Order placed: ", EnumToString(order_type),
            " ", g_calculated_lot, " lots | Risk: $",
            DoubleToString(g_potential_loss, 2));
   }
   else
   {
      Print("Risk_Calculator: Order FAILED. Error: ",
            trade.ResultRetcode(), " - ", trade.ResultRetcodeDescription());
      Alert("Order FAILED: ", trade.ResultRetcodeDescription());
   }
}

//+------------------------------------------------------------------+
//| Pre-flight safety checks                                          |
//+------------------------------------------------------------------+
bool PreFlightCheck()
{
   // Check lot size validity
   if(g_calculated_lot <= 0)
   {
      Alert("Risk_Calculator: Invalid lot size. Check risk/SL settings.");
      return false;
   }

   // Check spread
   int spread = (int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   if(spread > Max_Spread)
   {
      Alert("Risk_Calculator: Spread too high (", spread, " > ",
            Max_Spread, " points). Trade blocked.");
      Print("Risk_Calculator: Spread check FAILED. Current: ", spread,
            " Max: ", Max_Spread);
      return false;
   }

   // Check margin
   double required_margin = 0;
   if(!OrderCalcMargin(ORDER_TYPE_BUY, _Symbol, g_calculated_lot,
                       SymbolInfoDouble(_Symbol, SYMBOL_ASK), required_margin))
   {
      Alert("Risk_Calculator: Could not calculate margin requirement.");
      return false;
   }

   double free_margin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   if(required_margin > free_margin)
   {
      Alert("Risk_Calculator: Insufficient margin. Required: $",
            DoubleToString(required_margin, 2),
            " Available: $", DoubleToString(free_margin, 2));
      Print("Risk_Calculator: Margin check FAILED. Required: ",
            required_margin, " Free: ", free_margin);
      return false;
   }

   // Check if trading is allowed
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED))
   {
      Alert("Risk_Calculator: Automated trading is not enabled in terminal.");
      return false;
   }

   if(!MQLInfoInteger(MQL_TRADE_ALLOWED))
   {
      Alert("Risk_Calculator: EA trading is not allowed. Check EA properties.");
      return false;
   }

   return true;
}

//+------------------------------------------------------------------+
//| Update SL from ATR                                                |
//+------------------------------------------------------------------+
void UpdateSLFromATR()
{
   if(g_atr_handle == INVALID_HANDLE) return;

   double atr_buf[];
   if(CopyBuffer(g_atr_handle, 0, 0, 1, atr_buf) == 1)
   {
      double atr_val = atr_buf[0];
      g_sl_pips = NormalizeDouble((atr_val * g_atr_multiplier) / GetPipValue(), 1);

      ObjectSetString(0, OBJ_PREFIX + "SLEdit", OBJPROP_TEXT,
                      DoubleToString(g_sl_pips, 1));
   }
}

//+------------------------------------------------------------------+
//| Set ATR mode (show/hide elements)                                 |
//+------------------------------------------------------------------+
void SetATRMode(bool use_atr)
{
   ObjectSetInteger(0, OBJ_PREFIX + "ATRToggle", OBJPROP_TEXT,
                    use_atr ? "ATR Based" : "Manual Pips");

   // Show/hide manual SL edit
   ObjectSetInteger(0, OBJ_PREFIX + "SLLabel", OBJPROP_HIDDEN, use_atr);
   ObjectSetInteger(0, OBJ_PREFIX + "SLEdit", OBJPROP_HIDDEN, use_atr);

   // Show/hide ATR buttons
   ObjectSetInteger(0, OBJ_PREFIX + "ATR05", OBJPROP_HIDDEN, !use_atr);
   ObjectSetInteger(0, OBJ_PREFIX + "ATR075", OBJPROP_HIDDEN, !use_atr);
   ObjectSetInteger(0, OBJ_PREFIX + "ATR1", OBJPROP_HIDDEN, !use_atr);
   ObjectSetInteger(0, OBJ_PREFIX + "ATR15", OBJPROP_HIDDEN, !use_atr);

   // Show/hide ATR value
   ObjectSetInteger(0, OBJ_PREFIX + "ATRLabel", OBJPROP_HIDDEN, !use_atr);
   ObjectSetInteger(0, OBJ_PREFIX + "ATRValue", OBJPROP_HIDDEN, !use_atr);

   if(use_atr)
      UpdateSLFromATR();

   ChartRedraw();
}

//+------------------------------------------------------------------+
//| Set active preset button styling                                  |
//+------------------------------------------------------------------+
void SetActivePreset(const string active_name)
{
   string presets[] = {OBJ_PREFIX + "Preset05", OBJ_PREFIX + "Preset1",
                       OBJ_PREFIX + "Preset2", OBJ_PREFIX + "Preset3"};

   for(int i = 0; i < ArraySize(presets); i++)
   {
      if(presets[i] == active_name)
      {
         ObjectSetInteger(0, presets[i], OBJPROP_BGCOLOR, Accent_Gold);
         ObjectSetInteger(0, presets[i], OBJPROP_COLOR, Panel_BG);
      }
      else
      {
         ObjectSetInteger(0, presets[i], OBJPROP_BGCOLOR, Button_BG);
         ObjectSetInteger(0, presets[i], OBJPROP_COLOR, Text_Color);
      }
   }
}

//+------------------------------------------------------------------+
//| Set active ATR button styling                                     |
//+------------------------------------------------------------------+
void SetActiveATR(const string active_name)
{
   string atr_btns[] = {OBJ_PREFIX + "ATR05", OBJ_PREFIX + "ATR075",
                        OBJ_PREFIX + "ATR1", OBJ_PREFIX + "ATR15"};

   for(int i = 0; i < ArraySize(atr_btns); i++)
   {
      if(atr_btns[i] == active_name)
      {
         ObjectSetInteger(0, atr_btns[i], OBJPROP_BGCOLOR, Accent_Gold);
         ObjectSetInteger(0, atr_btns[i], OBJPROP_COLOR, Panel_BG);
      }
      else
      {
         ObjectSetInteger(0, atr_btns[i], OBJPROP_BGCOLOR, Button_BG);
         ObjectSetInteger(0, atr_btns[i], OBJPROP_COLOR, Text_Color);
      }
   }
}

//+------------------------------------------------------------------+
//| Reset all button states to default                                |
//+------------------------------------------------------------------+
void ResetButtonStates()
{
   // Buttons stay styled from last click; this is called before new click
   // Only reset preset styling if clicking non-preset
}

//+------------------------------------------------------------------+
//| Helper: Get pip size                                              |
//+------------------------------------------------------------------+
double GetPipValue()
{
   int digits_count = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   if(digits_count == 3 || digits_count == 5)
      return SymbolInfoDouble(_Symbol, SYMBOL_POINT) * 10.0;
   else
      return SymbolInfoDouble(_Symbol, SYMBOL_POINT);
}

//+------------------------------------------------------------------+
//| Helper: Get pip size for lot calculation (raw point)              |
//+------------------------------------------------------------------+
double GetPipSize()
{
   return SymbolInfoDouble(_Symbol, SYMBOL_POINT);
}

//+------------------------------------------------------------------+
//| Helper: Get digits                                                |
//+------------------------------------------------------------------+
int digits()
{
   return (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
}

//+------------------------------------------------------------------+
//| UI Builder: Create label                                          |
//+------------------------------------------------------------------+
void CreateLabel(const string name, int x, int y, string text,
                 color clr, int size, bool bold = false, bool right_align = false)
{
   ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetString(0, name, OBJPROP_FONT, Font_Name + (bold ? " Bold" : ""));
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, size);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, false);

   if(right_align)
   {
      ObjectSetInteger(0, name, OBJPROP_ANCHOR, ANCHOR_RIGHT_UPPER);
   }
}

//+------------------------------------------------------------------+
//| UI Builder: Create rectangle (filled)                             |
//+------------------------------------------------------------------+
void CreateRect(const string name, int x, int y, int width, int height, color clr)
{
   ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, width);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, height);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, false);
}

//+------------------------------------------------------------------+
//| UI Builder: Create rectangle border                               |
//+------------------------------------------------------------------+
void CreateRectBorder(const string name, int x, int y, int width, int height, color clr)
{
   ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, width);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, height);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, false);
}

//+------------------------------------------------------------------+
//| UI Builder: Create button                                         |
//+------------------------------------------------------------------+
void CreateButton(const string name, int x, int y, int width, int height,
                  string text, color bg_clr, color text_clr)
{
   ObjectCreate(0, name, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, width);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, height);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetString(0, name, OBJPROP_FONT, Font_Name);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, Font_Size);
   ObjectSetInteger(0, name, OBJPROP_COLOR, text_clr);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, bg_clr);
   ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, name, OBJPROP_COLOR, Panel_Border);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, name, OBJPROP_STATE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, false);
}

//+------------------------------------------------------------------+
//| UI Builder: Create edit field                                     |
//+------------------------------------------------------------------+
void CreateEdit(const string name, int x, int y, int width, int height, string text)
{
   ObjectCreate(0, name, OBJ_EDIT, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, width);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, height);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetString(0, name, OBJPROP_FONT, Font_Name);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, Font_Size);
   ObjectSetInteger(0, name, OBJPROP_COLOR, Text_Color);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, Button_BG);
   ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, name, OBJPROP_BORDER_COLOR, Panel_Border);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, name, OBJPROP_EDIT, true);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, false);
}
//+------------------------------------------------------------------+
