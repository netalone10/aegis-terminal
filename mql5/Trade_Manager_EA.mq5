//+------------------------------------------------------------------+
//| Trade_Manager_EA.mq5                                              |
//| ICT-Style Automated Trade Exit Management                         |
//| Breakeven · Partial Close · Trailing Stop · Time Exit             |
//+------------------------------------------------------------------+
#property copyright "Aegis Terminal"
#property version   "1.00"
#property strict

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>

//+------------------------------------------------------------------+
//| Input Parameters                                                  |
//+------------------------------------------------------------------+
input group "=== TP1 Settings ==="
input double   TP1_ATR_Multiple     = 0.5;     // ATR multiple for TP1 level
input int      ATR_Period           = 14;       // ATR lookback period
input ENUM_TIMEFRAMES ATR_Timeframe = PERIOD_CURRENT; // ATR timeframe

input group "=== Breakeven Settings ==="
input bool     Enable_Breakeven     = true;     // Enable auto breakeven
input double   Spread_Buffer        = 0.0;      // Extra pips above entry for BE SL

input group "=== Partial Close Settings ==="
input bool     Enable_Partial_Close = true;     // Enable partial close at TP1
input double   Partial_Close_Pct    = 50.0;     // % of position to close at TP1

input group "=== Trailing Stop Settings ==="
input bool     Enable_Trailing      = true;     // Enable ATR trailing stop
input double   Trail_ATR_Multiple   = 1.0;      // ATR multiple for trail distance
input bool     Use_Swing_Lows       = true;     // Trail behind swing structure

input group "=== Time Exit Settings ==="
input double   Max_Hold_Hours       = 0.0;      // Max hold time (0 = disabled)
input bool     Close_On_Friday      = false;    // Force close before weekend

input group "=== Safety Settings ==="
input ulong    Magic_Number         = 0;        // Magic number filter (0 = all)
input bool     Enable_Notifications = true;     // Send push/alert notifications

//+------------------------------------------------------------------+
//| Globals                                                           |
//+------------------------------------------------------------------+
CTrade         trade;
CPositionInfo  posInfo;

struct TradeState
{
    ulong   ticket;
    double  entry_price;
    double  tp1_level;
    double  current_sl;
    bool    tp1_hit;
    bool    partial_done;
    bool    breakeven_done;
    datetime open_time;
    double  original_volume;
};

#define MAX_POSITIONS 100
TradeState g_states[MAX_POSITIONS];
int        g_stateCount = 0;

int    g_atrHandle = INVALID_HANDLE;
double g_atrBuffer[];

//+------------------------------------------------------------------+
//| Expert initialization function                                    |
//+------------------------------------------------------------------+
int OnInit()
{
    // Validate inputs
    if(TP1_ATR_Multiple <= 0)
    {
        Print("ERROR: TP1_ATR_Multiple must be > 0");
        return(INIT_PARAMETERS_INCORRECT);
    }
    if(Partial_Close_Pct <= 0 || Partial_Close_Pct >= 100)
    {
        Print("ERROR: Partial_Close_Pct must be between 0 and 100");
        return(INIT_PARAMETERS_INCORRECT);
    }

    // Set magic number for trade operations
    trade.SetExpertMagicNumber(Magic_Number);

    // Initialize ATR handle
    g_atrHandle = iATR(_Symbol, ATR_Timeframe, ATR_Period);
    if(g_atrHandle == INVALID_HANDLE)
    {
        Print("ERROR: Failed to create ATR indicator handle");
        return(INIT_FAILED);
    }

    ArraySetAsSeries(g_atrBuffer, true);

    Print("Trade Manager EA initialized | Magic: ", Magic_Number,
          " | TP1_ATR: ", TP1_ATR_Multiple,
          " | Trail_ATR: ", Trail_ATR_Multiple,
          " | Partial: ", Partial_Close_Pct, "%");

    return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
    if(g_atrHandle != INVALID_HANDLE)
        IndicatorRelease(g_atrHandle);

    Print("Trade Manager EA deinitialized. Reason: ", reason);
}

//+------------------------------------------------------------------+
//| Expert tick function — main loop                                   |
//+------------------------------------------------------------------+
void OnTick()
{
    // Ensure we have ATR data
    if(!RefreshATR())
        return;

    double currentATR = g_atrBuffer[0];
    double point      = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
    double spread     = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD) * point;
    double pip        = (_Digits == 3 || _Digits == 5) ? point * 10.0 : point;

    // Scan all open positions
    ScanOpenPositions();

    // Process each tracked position
    for(int i = g_stateCount - 1; i >= 0; i--)
    {
        // Verify position still exists
        if(!PositionSelectByTicket(g_states[i].ticket))
        {
            RemoveState(i);
            continue;
        }

        // Only manage positions with matching magic number
        if(Magic_Number != 0 && PositionGetInteger(POSITION_MAGIC) != Magic_Number)
            continue;

        TradeState &state = g_states[i];
        double entryPrice = state.entry_price;
        double currentSL  = PositionGetDouble(POSITION_SL);
        double currentTP  = PositionGetDouble(POSITION_TP);
        double volume     = PositionGetDouble(POSITION_VOLUME);
        long   posType    = PositionGetInteger(POSITION_TYPE);

        //--- Calculate TP1 level if not set
        if(state.tp1_level == 0.0)
        {
            if(posType == POSITION_TYPE_BUY)
                state.tp1_level = entryPrice + (currentATR * TP1_ATR_Multiple);
            else
                state.tp1_level = entryPrice - (currentATR * TP1_ATR_Multiple);

            PrintFormat("Ticket %d | TP1 set at %.5f (Entry: %.5f, ATR: %.5f)",
                        state.ticket, state.tp1_level, entryPrice, currentATR);
        }

        //--- Store original volume on first run
        if(state.original_volume == 0.0)
            state.original_volume = volume;

        double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
        double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);

        //--- Step 1: Check if TP1 is hit
        if(!state.tp1_hit)
        {
            bool tp1Reached = false;
            if(posType == POSITION_TYPE_BUY && bid >= state.tp1_level)
                tp1Reached = true;
            else if(posType == POSITION_TYPE_SELL && ask <= state.tp1_level)
                tp1Reached = true;

            if(tp1Reached)
            {
                state.tp1_hit = true;
                PrintFormat("★★★ Ticket %d | TP1 HIT at price %.5f", state.ticket,
                            (posType == POSITION_TYPE_BUY) ? bid : ask);

                //--- Step 2: Breakeven
                if(Enable_Breakeven && !state.breakeven_done)
                {
                    double newSL;
                    if(posType == POSITION_TYPE_BUY)
                        newSL = entryPrice + spread + (Spread_Buffer * pip);
                    else
                        newSL = entryPrice - spread - (Spread_Buffer * pip);

                    if(ShouldModifySL(posType, currentSL, newSL))
                    {
                        if(trade.PositionModify(state.ticket, newSL, currentTP))
                        {
                            state.breakeven_done = true;
                            state.current_sl     = newSL;
                            LogAction("BREAKEVEN", state.ticket,
                                      StringFormat("SL moved to %.5f (entry + spread)", newSL));
                        }
                        else
                        {
                            PrintFormat("ERROR: Breakeven SL failed for ticket %d | Error: %d",
                                        state.ticket, GetLastError());
                        }
                    }
                }

                //--- Step 3: Partial Close
                if(Enable_Partial_Close && !state.partial_done)
                {
                    double closeVolume = NormalizeLot(state.original_volume * Partial_Close_Pct / 100.0);

                    // Ensure minimum volume
                    double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
                    if(closeVolume >= minLot && (volume - closeVolume) >= minLot)
                    {
                        if(trade.PositionClosePartial(state.ticket, closeVolume))
                        {
                            state.partial_done = true;
                            LogAction("PARTIAL_CLOSE", state.ticket,
                                      StringFormat("%.2f lots closed (%.0f%% of %.2f)",
                                                   closeVolume, Partial_Close_Pct, state.original_volume));
                        }
                        else
                        {
                            PrintFormat("ERROR: Partial close failed for ticket %d | Error: %d",
                                        state.ticket, GetLastError());
                        }
                    }
                    else
                    {
                        // Volume too small for partial close — mark done
                        state.partial_done = true;
                        PrintFormat("Ticket %d | Partial close skipped: closeVol=%.2f < minLot=%.2f",
                                    state.ticket, closeVolume, minLot);
                    }
                }
            }
        }

        //--- Step 4: Trailing Stop (only after TP1 hit)
        if(Enable_Trailing && state.tp1_hit)
        {
            double trailDistance = currentATR * Trail_ATR_Multiple;
            double newSL;

            if(posType == POSITION_TYPE_BUY)
            {
                newSL = bid - trailDistance;

                // Use swing low if enabled
                if(Use_Swing_Lows)
                {
                    double swingLow = FindSwingLow();
                    if(swingLow > 0 && swingLow > entryPrice)
                    {
                        double swingSL = swingLow - (trailDistance * 0.25);
                        newSL = MathMax(newSL, swingSL);
                    }
                }
            }
            else // SELL
            {
                newSL = ask + trailDistance;

                // Use swing high if enabled
                if(Use_Swing_Lows)
                {
                    double swingHigh = FindSwingHigh();
                    if(swingHigh > 0 && swingHigh < entryPrice)
                    {
                        double swingSL = swingHigh + (trailDistance * 0.25);
                        newSL = MathMin(newSL, swingSL);
                    }
                }
            }

            // Only move SL in favorable direction
            if(ShouldModifySL(posType, currentSL, newSL))
            {
                if(trade.PositionModify(state.ticket, newSL, currentTP))
                {
                    state.current_sl = newSL;
                    PrintFormat("Ticket %d | TRAIL SL → %.5f (dist: %.5f)",
                                state.ticket, newSL, trailDistance);
                }
            }
        }

        //--- Step 5: Time-based Exit
        if(Max_Hold_Hours > 0)
        {
            double hoursOpen = (double)(TimeCurrent() - state.open_time) / 3600.0;
            if(hoursOpen >= Max_Hold_Hours)
            {
                if(trade.PositionClose(state.ticket))
                {
                    LogAction("TIME_EXIT", state.ticket,
                              StringFormat("Closed after %.1f hours (max: %.1f)",
                                           hoursOpen, Max_Hold_Hours));
                    RemoveState(i);
                    continue;
                }
            }
        }

        //--- Friday close
        if(Close_On_Friday)
        {
            MqlDateTime dt;
            TimeCurrent(dt);
            if(dt.day_of_week == 5 && dt.hour >= 20)
            {
                if(trade.PositionClose(state.ticket))
                {
                    LogAction("FRIDAY_EXIT", state.ticket, "Pre-weekend close");
                    RemoveState(i);
                    continue;
                }
            }
        }
    }
}

//+------------------------------------------------------------------+
//| Scan positions and register new ones into state tracker            |
//+------------------------------------------------------------------+
void ScanOpenPositions()
{
    for(int i = PositionsTotal() - 1; i >= 0; i--)
    {
        ulong ticket = PositionGetTicket(i);
        if(ticket == 0)
            continue;

        // Filter by magic number
        if(Magic_Number != 0 && PositionGetInteger(POSITION_MAGIC) != Magic_Number)
            continue;

        // Filter by symbol
        if(PositionGetString(POSITION_SYMBOL) != _Symbol)
            continue;

        // Check if already tracked
        bool found = false;
        for(int j = 0; j < g_stateCount; j++)
        {
            if(g_states[j].ticket == ticket)
            {
                found = true;
                break;
            }
        }

        // Register new position
        if(!found && g_stateCount < MAX_POSITIONS)
        {
            g_states[g_stateCount].ticket            = ticket;
            g_states[g_stateCount].entry_price        = PositionGetDouble(POSITION_PRICE_OPEN);
            g_states[g_stateCount].tp1_level           = 0.0; // calculated on first tick
            g_states[g_stateCount].current_sl          = PositionGetDouble(POSITION_SL);
            g_states[g_stateCount].tp1_hit             = false;
            g_states[g_stateCount].partial_done        = false;
            g_states[g_stateCount].breakeven_done      = false;
            g_states[g_stateCount].open_time           = (datetime)PositionGetInteger(POSITION_TIME);
            g_states[g_stateCount].original_volume     = PositionGetDouble(POSITION_VOLUME);

            PrintFormat("New position tracked | Ticket: %d | Entry: %.5f | Volume: %.2f | Time: %s",
                        ticket,
                        g_states[g_stateCount].entry_price,
                        g_states[g_stateCount].original_volume,
                        TimeToString(g_states[g_stateCount].open_time, TIME_DATE | TIME_SECONDS));

            g_stateCount++;
        }
    }
}

//+------------------------------------------------------------------+
//| Remove state entry by index (swap with last, decrement count)     |
//+------------------------------------------------------------------+
void RemoveState(int index)
{
    if(index < 0 || index >= g_stateCount)
        return;

    if(index < g_stateCount - 1)
        g_states[index] = g_states[g_stateCount - 1];

    g_stateCount--;
}

//+------------------------------------------------------------------+
//| Refresh ATR buffer                                                |
//+------------------------------------------------------------------+
bool RefreshATR()
{
    if(CopyBuffer(g_atrHandle, 0, 0, 3, g_atrBuffer) != 3)
    {
        Print("WARNING: Could not copy ATR data");
        return false;
    }
    return true;
}

//+------------------------------------------------------------------+
//| Should modify SL? (only move in favorable direction)              |
//+------------------------------------------------------------------+
bool ShouldModifySL(long posType, double currentSL, double newSL)
{
    double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
    double minSL = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * point;

    if(posType == POSITION_TYPE_BUY)
    {
        // Only move SL up
        if(newSL <= currentSL)
            return false;
        // Minimum distance from current price
        double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
        if(bid - newSL < minSL)
            return false;
        return true;
    }
    else // SELL
    {
        // Only move SL down
        if(currentSL != 0 && newSL >= currentSL)
            return false;
        // Minimum distance from current price
        double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
        if(ask - newSL < minSL)
            return false;
        return true;
    }
}

//+------------------------------------------------------------------+
//| Find recent swing low (simplified — lowest low in last N bars)     |
//+------------------------------------------------------------------+
double FindSwingLow()
{
    double lows[];
    ArraySetAsSeries(lows, true);

    if(CopyLow(_Symbol, PERIOD_CURRENT, 1, 20, lows) < 20)
        return 0;

    double swingLow = lows[0];
    for(int i = 1; i < 20; i++)
    {
        if(lows[i] < swingLow)
            swingLow = lows[i];
    }
    return swingLow;
}

//+------------------------------------------------------------------+
//| Find recent swing high (simplified — highest high in last N bars)  |
//+------------------------------------------------------------------+
double FindSwingHigh()
{
    double highs[];
    ArraySetAsSeries(highs, true);

    if(CopyHigh(_Symbol, PERIOD_CURRENT, 1, 20, highs) < 20)
        return 0;

    double swingHigh = highs[0];
    for(int i = 1; i < 20; i++)
    {
        if(highs[i] > swingHigh)
            swingHigh = highs[i];
    }
    return swingHigh;
}

//+------------------------------------------------------------------+
//| Normalize lot size to broker requirements                         |
//+------------------------------------------------------------------+
double NormalizeLot(double volume)
{
    double minLot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
    double maxLot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
    double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

    if(lotStep > 0)
        volume = MathFloor(volume / lotStep) * lotStep;

    volume = MathMax(volume, minLot);
    volume = MathMin(volume, maxLot);

    return NormalizeDouble(volume, 2);
}

//+------------------------------------------------------------------+
//| Log action with timestamp                                         |
//+------------------------------------------------------------------+
void LogAction(string action, ulong ticket, string details)
{
    string msg = StringFormat("[%s] %s | Ticket: %d | %s",
                              TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS),
                              action, ticket, details);

    Print(msg);

    if(Enable_Notifications)
        Alert(msg);
}

//+------------------------------------------------------------------+
//| Tester function (for optimization / backtesting)                  |
//+------------------------------------------------------------------+
double OnTester()
{
    // Custom criterion: net profit with drawdown penalty
    double netProfit = TesterStatistics(STAT_PROFIT);
    double maxDD     = TesterStatistics(STAT_EQUITY_DDREL_PERCENT);

    if(maxDD > 0)
        return netProfit / maxDD;

    return netProfit;
}
//+------------------------------------------------------------------+
