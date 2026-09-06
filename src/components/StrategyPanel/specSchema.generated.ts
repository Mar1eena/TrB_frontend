// СГЕНЕРИРОВАНО scripts/gen-spec-schema.mjs — НЕ РЕДАКТИРОВАТЬ ВРУЧНУЮ.
// Источник: TrB_proto/services/indicators/params.proto + strategy/spec.proto
// Индикаторов: 158. Обновить: npm run gen:spec-schema

export type ParamType = "int" | "float" | "enum";

export type ParamDef = {
  name: string;
  jsonName: string;
  type: ParamType;
  enumName?: string;
  default: number;
};

export type IndicatorDef = {
  key: string;
  func: string;
  labelEn: string;
  category: string;
  params: ParamDef[];
  outputs?: string[];
};

export type EnumValue = { value: string; labelEn: string };

export const INDICATORS: IndicatorDef[] = [
  {
    "key": "ht_dcperiod",
    "func": "HT_DCPERIOD",
    "labelEn": "Hilbert Transform - Dominant Cycle Period",
    "category": "Cycle",
    "params": []
  },
  {
    "key": "ht_dcphase",
    "func": "HT_DCPHASE",
    "labelEn": "Hilbert Transform - Dominant Cycle Phase",
    "category": "Cycle",
    "params": []
  },
  {
    "key": "ht_phasor",
    "func": "HT_PHASOR",
    "labelEn": "Hilbert Transform - Phasor Components",
    "category": "Cycle",
    "params": []
  },
  {
    "key": "ht_sine",
    "func": "HT_SINE",
    "labelEn": "Hilbert Transform - SineWave",
    "category": "Cycle",
    "params": []
  },
  {
    "key": "ht_trendmode",
    "func": "HT_TRENDMODE",
    "labelEn": "Hilbert Transform - Trend vs Cycle Mode",
    "category": "Cycle",
    "params": []
  },
  {
    "key": "acos",
    "func": "ACOS",
    "labelEn": "Vector Trigonometric ACos",
    "category": "Math",
    "params": []
  },
  {
    "key": "add",
    "func": "ADD",
    "labelEn": "Vector Arithmetic Add",
    "category": "Math",
    "params": []
  },
  {
    "key": "asin",
    "func": "ASIN",
    "labelEn": "Vector Trigonometric ASin",
    "category": "Math",
    "params": []
  },
  {
    "key": "atan",
    "func": "ATAN",
    "labelEn": "Vector Trigonometric ATan",
    "category": "Math",
    "params": []
  },
  {
    "key": "ceil",
    "func": "CEIL",
    "labelEn": "Vector Ceil",
    "category": "Math",
    "params": []
  },
  {
    "key": "cos",
    "func": "COS",
    "labelEn": "Vector Trigonometric Cos",
    "category": "Math",
    "params": []
  },
  {
    "key": "cosh",
    "func": "COSH",
    "labelEn": "Vector Trigonometric Cosh",
    "category": "Math",
    "params": []
  },
  {
    "key": "div",
    "func": "DIV",
    "labelEn": "Vector Arithmetic Div",
    "category": "Math",
    "params": []
  },
  {
    "key": "exp",
    "func": "EXP",
    "labelEn": "Vector Arithmetic Exp",
    "category": "Math",
    "params": []
  },
  {
    "key": "floor",
    "func": "FLOOR",
    "labelEn": "Vector Floor",
    "category": "Math",
    "params": []
  },
  {
    "key": "ln",
    "func": "LN",
    "labelEn": "Vector Log Natural",
    "category": "Math",
    "params": []
  },
  {
    "key": "log10",
    "func": "LOG10",
    "labelEn": "Vector Log10",
    "category": "Math",
    "params": []
  },
  {
    "key": "max",
    "func": "MAX",
    "labelEn": "Highest value over a specified period",
    "category": "Math",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "maxindex",
    "func": "MAXINDEX",
    "labelEn": "Index of highest value over a specified period",
    "category": "Math",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "min",
    "func": "MIN",
    "labelEn": "Lowest value over a specified period",
    "category": "Math",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "minindex",
    "func": "MININDEX",
    "labelEn": "Index of lowest value over a specified period",
    "category": "Math",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "minmax",
    "func": "MINMAX",
    "labelEn": "Lowest and highest values over a specified period",
    "category": "Math",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ],
    "outputs": [
      "min",
      "max"
    ]
  },
  {
    "key": "minmaxindex",
    "func": "MINMAXINDEX",
    "labelEn": "Indexes of lowest and highest values over a specified period",
    "category": "Math",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ],
    "outputs": [
      "minidx",
      "maxidx"
    ]
  },
  {
    "key": "mult",
    "func": "MULT",
    "labelEn": "Vector Arithmetic Mult",
    "category": "Math",
    "params": []
  },
  {
    "key": "sin",
    "func": "SIN",
    "labelEn": "Vector Trigonometric Sin",
    "category": "Math",
    "params": []
  },
  {
    "key": "sinh",
    "func": "SINH",
    "labelEn": "Vector Trigonometric Sinh",
    "category": "Math",
    "params": []
  },
  {
    "key": "sqrt",
    "func": "SQRT",
    "labelEn": "Vector Square Root",
    "category": "Math",
    "params": []
  },
  {
    "key": "sub",
    "func": "SUB",
    "labelEn": "Vector Arithmetic Subtraction",
    "category": "Math",
    "params": []
  },
  {
    "key": "sum",
    "func": "SUM",
    "labelEn": "Summation",
    "category": "Math",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "tan",
    "func": "TAN",
    "labelEn": "Vector Trigonometric Tan",
    "category": "Math",
    "params": []
  },
  {
    "key": "tanh",
    "func": "TANH",
    "labelEn": "Vector Trigonometric Tanh",
    "category": "Math",
    "params": []
  },
  {
    "key": "adx",
    "func": "ADX",
    "labelEn": "Average Directional Movement Index",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "adxr",
    "func": "ADXR",
    "labelEn": "Average Directional Movement Index Rating",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "apo",
    "func": "APO",
    "labelEn": "Absolute Price Oscillator",
    "category": "Momentum",
    "params": [
      {
        "name": "fast_period",
        "jsonName": "fastPeriod",
        "type": "int",
        "default": 12
      },
      {
        "name": "slow_period",
        "jsonName": "slowPeriod",
        "type": "int",
        "default": 26
      },
      {
        "name": "ma_type",
        "jsonName": "maType",
        "type": "enum",
        "enumName": "MAType",
        "default": 0
      }
    ]
  },
  {
    "key": "aroon",
    "func": "AROON",
    "labelEn": "Aroon",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ],
    "outputs": [
      "aroondown",
      "aroonup"
    ]
  },
  {
    "key": "aroonosc",
    "func": "AROONOSC",
    "labelEn": "Aroon Oscillator",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "bop",
    "func": "BOP",
    "labelEn": "Balance Of Power",
    "category": "Momentum",
    "params": []
  },
  {
    "key": "cci",
    "func": "CCI",
    "labelEn": "Commodity Channel Index",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "cmo",
    "func": "CMO",
    "labelEn": "Chande Momentum Oscillator",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "dx",
    "func": "DX",
    "labelEn": "Directional Movement Index",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "macd",
    "func": "MACD",
    "labelEn": "Moving Average Convergence/Divergence",
    "category": "Momentum",
    "params": [
      {
        "name": "fast_period",
        "jsonName": "fastPeriod",
        "type": "int",
        "default": 12
      },
      {
        "name": "slow_period",
        "jsonName": "slowPeriod",
        "type": "int",
        "default": 26
      },
      {
        "name": "signal_period",
        "jsonName": "signalPeriod",
        "type": "int",
        "default": 9
      }
    ],
    "outputs": [
      "macd",
      "signal",
      "hist"
    ]
  },
  {
    "key": "macdext",
    "func": "MACDEXT",
    "labelEn": "MACD with controllable MA type",
    "category": "Momentum",
    "params": [
      {
        "name": "fast_period",
        "jsonName": "fastPeriod",
        "type": "int",
        "default": 12
      },
      {
        "name": "fast_ma_type",
        "jsonName": "fastMaType",
        "type": "enum",
        "enumName": "MAType",
        "default": 0
      },
      {
        "name": "slow_period",
        "jsonName": "slowPeriod",
        "type": "int",
        "default": 26
      },
      {
        "name": "slow_ma_type",
        "jsonName": "slowMaType",
        "type": "enum",
        "enumName": "MAType",
        "default": 0
      },
      {
        "name": "signal_period",
        "jsonName": "signalPeriod",
        "type": "int",
        "default": 9
      },
      {
        "name": "signal_ma_type",
        "jsonName": "signalMaType",
        "type": "enum",
        "enumName": "MAType",
        "default": 0
      }
    ],
    "outputs": [
      "macd",
      "signal",
      "hist"
    ]
  },
  {
    "key": "macdfix",
    "func": "MACDFIX",
    "labelEn": "Moving Average Convergence/Divergence Fix 12/26",
    "category": "Momentum",
    "params": [
      {
        "name": "signal_period",
        "jsonName": "signalPeriod",
        "type": "int",
        "default": 9
      }
    ],
    "outputs": [
      "macd",
      "signal",
      "hist"
    ]
  },
  {
    "key": "mfi",
    "func": "MFI",
    "labelEn": "Money Flow Index",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "minus_di",
    "func": "MINUS_DI",
    "labelEn": "Minus Directional Indicator",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "minus_dm",
    "func": "MINUS_DM",
    "labelEn": "Minus Directional Movement",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "mom",
    "func": "MOM",
    "labelEn": "Momentum",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "plus_di",
    "func": "PLUS_DI",
    "labelEn": "Plus Directional Indicator",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "plus_dm",
    "func": "PLUS_DM",
    "labelEn": "Plus Directional Movement",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "ppo",
    "func": "PPO",
    "labelEn": "Percentage Price Oscillator",
    "category": "Momentum",
    "params": [
      {
        "name": "fast_period",
        "jsonName": "fastPeriod",
        "type": "int",
        "default": 12
      },
      {
        "name": "slow_period",
        "jsonName": "slowPeriod",
        "type": "int",
        "default": 26
      },
      {
        "name": "ma_type",
        "jsonName": "maType",
        "type": "enum",
        "enumName": "MAType",
        "default": 0
      }
    ]
  },
  {
    "key": "roc",
    "func": "ROC",
    "labelEn": "Rate of change : ((price/prevPrice)-1)*100",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "rocp",
    "func": "ROCP",
    "labelEn": "Rate of change Percentage: (price-prevPrice)/prevPrice",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "rocr",
    "func": "ROCR",
    "labelEn": "Rate of change ratio: (price/prevPrice)",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "rocr100",
    "func": "ROCR100",
    "labelEn": "Rate of change ratio 100 scale: (price/prevPrice)*100",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "rsi",
    "func": "RSI",
    "labelEn": "Relative Strength Index",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "stoch",
    "func": "STOCH",
    "labelEn": "Stochastic",
    "category": "Momentum",
    "params": [
      {
        "name": "fast_k_period",
        "jsonName": "fastKPeriod",
        "type": "int",
        "default": 5
      },
      {
        "name": "slow_k_period",
        "jsonName": "slowKPeriod",
        "type": "int",
        "default": 3
      },
      {
        "name": "slow_k_ma_type",
        "jsonName": "slowKMaType",
        "type": "enum",
        "enumName": "MAType",
        "default": 0
      },
      {
        "name": "slow_d_period",
        "jsonName": "slowDPeriod",
        "type": "int",
        "default": 3
      },
      {
        "name": "slow_d_ma_type",
        "jsonName": "slowDMaType",
        "type": "enum",
        "enumName": "MAType",
        "default": 0
      }
    ],
    "outputs": [
      "slowk",
      "slowd"
    ]
  },
  {
    "key": "stochf",
    "func": "STOCHF",
    "labelEn": "Stochastic Fast",
    "category": "Momentum",
    "params": [
      {
        "name": "fast_k_period",
        "jsonName": "fastKPeriod",
        "type": "int",
        "default": 5
      },
      {
        "name": "fast_d_period",
        "jsonName": "fastDPeriod",
        "type": "int",
        "default": 3
      },
      {
        "name": "fast_d_ma_type",
        "jsonName": "fastDMaType",
        "type": "enum",
        "enumName": "MAType",
        "default": 0
      }
    ],
    "outputs": [
      "fastk",
      "fastd"
    ]
  },
  {
    "key": "stochrsi",
    "func": "STOCHRSI",
    "labelEn": "Stochastic Relative Strength Index",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      },
      {
        "name": "fast_k_period",
        "jsonName": "fastKPeriod",
        "type": "int",
        "default": 5
      },
      {
        "name": "fast_d_period",
        "jsonName": "fastDPeriod",
        "type": "int",
        "default": 3
      },
      {
        "name": "fast_d_ma_type",
        "jsonName": "fastDMaType",
        "type": "enum",
        "enumName": "MAType",
        "default": 0
      }
    ],
    "outputs": [
      "fastk",
      "fastd"
    ]
  },
  {
    "key": "trix",
    "func": "TRIX",
    "labelEn": "1-day Rate-Of-Change (ROC) of a Triple Smooth EMA",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "ultosc",
    "func": "ULTOSC",
    "labelEn": "Ultimate Oscillator",
    "category": "Momentum",
    "params": [
      {
        "name": "period1",
        "jsonName": "period1",
        "type": "int",
        "default": 7
      },
      {
        "name": "period2",
        "jsonName": "period2",
        "type": "int",
        "default": 14
      },
      {
        "name": "period3",
        "jsonName": "period3",
        "type": "int",
        "default": 28
      }
    ]
  },
  {
    "key": "willr",
    "func": "WILLR",
    "labelEn": "Williams' %R",
    "category": "Momentum",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "bbands",
    "func": "BBANDS",
    "labelEn": "Bollinger Bands",
    "category": "Overlap Studies",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      },
      {
        "name": "nb_dev_up",
        "jsonName": "nbDevUp",
        "type": "float",
        "default": 2
      },
      {
        "name": "nb_dev_dn",
        "jsonName": "nbDevDn",
        "type": "float",
        "default": 2
      },
      {
        "name": "ma_type",
        "jsonName": "maType",
        "type": "enum",
        "enumName": "MAType",
        "default": 0
      }
    ],
    "outputs": [
      "upper",
      "middle",
      "lower"
    ]
  },
  {
    "key": "dema",
    "func": "DEMA",
    "labelEn": "Double Exponential Moving Average",
    "category": "Overlap Studies",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "ema",
    "func": "EMA",
    "labelEn": "Exponential Moving Average",
    "category": "Overlap Studies",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "ht_trendline",
    "func": "HT_TRENDLINE",
    "labelEn": "Hilbert Transform - Instantaneous Trendline",
    "category": "Overlap Studies",
    "params": []
  },
  {
    "key": "kama",
    "func": "KAMA",
    "labelEn": "Kaufman Adaptive Moving Average",
    "category": "Overlap Studies",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "ma",
    "func": "MA",
    "labelEn": "Moving average",
    "category": "Overlap Studies",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      },
      {
        "name": "ma_type",
        "jsonName": "maType",
        "type": "enum",
        "enumName": "MAType",
        "default": 0
      }
    ]
  },
  {
    "key": "mama",
    "func": "MAMA",
    "labelEn": "MESA Adaptive Moving Average",
    "category": "Overlap Studies",
    "params": [
      {
        "name": "fast_limit",
        "jsonName": "fastLimit",
        "type": "float",
        "default": 0.5
      },
      {
        "name": "slow_limit",
        "jsonName": "slowLimit",
        "type": "float",
        "default": 0.05
      }
    ],
    "outputs": [
      "mama",
      "fama"
    ]
  },
  {
    "key": "mavp",
    "func": "MAVP",
    "labelEn": "Moving average with variable period",
    "category": "Overlap Studies",
    "params": [
      {
        "name": "min_period",
        "jsonName": "minPeriod",
        "type": "int",
        "default": 2
      },
      {
        "name": "max_period",
        "jsonName": "maxPeriod",
        "type": "int",
        "default": 30
      },
      {
        "name": "ma_type",
        "jsonName": "maType",
        "type": "enum",
        "enumName": "MAType",
        "default": 0
      }
    ]
  },
  {
    "key": "midpoint",
    "func": "MIDPOINT",
    "labelEn": "MidPoint over period",
    "category": "Overlap Studies",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "midprice",
    "func": "MIDPRICE",
    "labelEn": "Midpoint Price over period",
    "category": "Overlap Studies",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "sar",
    "func": "SAR",
    "labelEn": "Parabolic SAR",
    "category": "Overlap Studies",
    "params": [
      {
        "name": "acceleration",
        "jsonName": "acceleration",
        "type": "float",
        "default": 0.02
      },
      {
        "name": "maximum",
        "jsonName": "maximum",
        "type": "float",
        "default": 0.2
      }
    ]
  },
  {
    "key": "sarext",
    "func": "SAREXT",
    "labelEn": "Parabolic SAR - Extended",
    "category": "Overlap Studies",
    "params": [
      {
        "name": "start_value",
        "jsonName": "startValue",
        "type": "float",
        "default": 0
      },
      {
        "name": "offset_on_reverse",
        "jsonName": "offsetOnReverse",
        "type": "float",
        "default": 0
      },
      {
        "name": "acceleration_init_long",
        "jsonName": "accelerationInitLong",
        "type": "float",
        "default": 0.02
      },
      {
        "name": "acceleration_long",
        "jsonName": "accelerationLong",
        "type": "float",
        "default": 0.02
      },
      {
        "name": "acceleration_max_long",
        "jsonName": "accelerationMaxLong",
        "type": "float",
        "default": 0.2
      },
      {
        "name": "acceleration_init_short",
        "jsonName": "accelerationInitShort",
        "type": "float",
        "default": 0.02
      },
      {
        "name": "acceleration_short",
        "jsonName": "accelerationShort",
        "type": "float",
        "default": 0.02
      },
      {
        "name": "acceleration_max_short",
        "jsonName": "accelerationMaxShort",
        "type": "float",
        "default": 0.2
      }
    ]
  },
  {
    "key": "sma",
    "func": "SMA",
    "labelEn": "Simple Moving Average",
    "category": "Overlap Studies",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "t3",
    "func": "T3",
    "labelEn": "Triple Exponential Moving Average (T3)",
    "category": "Overlap Studies",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      },
      {
        "name": "v_factor",
        "jsonName": "vFactor",
        "type": "float",
        "default": 0.7
      }
    ]
  },
  {
    "key": "tema",
    "func": "TEMA",
    "labelEn": "Triple Exponential Moving Average",
    "category": "Overlap Studies",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "trima",
    "func": "TRIMA",
    "labelEn": "Triangular Moving Average",
    "category": "Overlap Studies",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "wma",
    "func": "WMA",
    "labelEn": "Weighted Moving Average",
    "category": "Overlap Studies",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "cdl2crows",
    "func": "CDL2CROWS",
    "labelEn": "Two Crows",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdl3blackcrows",
    "func": "CDL3BLACKCROWS",
    "labelEn": "Three Black Crows",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdl3inside",
    "func": "CDL3INSIDE",
    "labelEn": "Three Inside Up/Down",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdl3linestrike",
    "func": "CDL3LINESTRIKE",
    "labelEn": "Three-Line Strike",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdl3outside",
    "func": "CDL3OUTSIDE",
    "labelEn": "Three Outside Up/Down",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdl3starsinsouth",
    "func": "CDL3STARSINSOUTH",
    "labelEn": "Three Stars In The South",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdl3whitesoldiers",
    "func": "CDL3WHITESOLDIERS",
    "labelEn": "Three Advancing White Soldiers",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlabandonedbaby",
    "func": "CDLABANDONEDBABY",
    "labelEn": "Abandoned Baby",
    "category": "Pattern Recognition",
    "params": [
      {
        "name": "penetration",
        "jsonName": "penetration",
        "type": "float",
        "default": 0.3
      }
    ]
  },
  {
    "key": "cdladvanceblock",
    "func": "CDLADVANCEBLOCK",
    "labelEn": "Advance Block",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlbelthold",
    "func": "CDLBELTHOLD",
    "labelEn": "Belt-hold",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlbreakaway",
    "func": "CDLBREAKAWAY",
    "labelEn": "Breakaway",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlclosingmarubozu",
    "func": "CDLCLOSINGMARUBOZU",
    "labelEn": "Closing Marubozu",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlconcealbabyswall",
    "func": "CDLCONCEALBABYSWALL",
    "labelEn": "Concealing Baby Swallow",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlcounterattack",
    "func": "CDLCOUNTERATTACK",
    "labelEn": "Counterattack",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdldarkcloudcover",
    "func": "CDLDARKCLOUDCOVER",
    "labelEn": "Dark Cloud Cover",
    "category": "Pattern Recognition",
    "params": [
      {
        "name": "penetration",
        "jsonName": "penetration",
        "type": "float",
        "default": 0.3
      }
    ]
  },
  {
    "key": "cdldoji",
    "func": "CDLDOJI",
    "labelEn": "Doji",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdldojistar",
    "func": "CDLDOJISTAR",
    "labelEn": "Doji Star",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdldragonflydoji",
    "func": "CDLDRAGONFLYDOJI",
    "labelEn": "Dragonfly Doji",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlengulfing",
    "func": "CDLENGULFING",
    "labelEn": "Engulfing Pattern",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdleveningdojistar",
    "func": "CDLEVENINGDOJISTAR",
    "labelEn": "Evening Doji Star",
    "category": "Pattern Recognition",
    "params": [
      {
        "name": "penetration",
        "jsonName": "penetration",
        "type": "float",
        "default": 0.3
      }
    ]
  },
  {
    "key": "cdleveningstar",
    "func": "CDLEVENINGSTAR",
    "labelEn": "Evening Star",
    "category": "Pattern Recognition",
    "params": [
      {
        "name": "penetration",
        "jsonName": "penetration",
        "type": "float",
        "default": 0.3
      }
    ]
  },
  {
    "key": "cdlgapsidesidewhite",
    "func": "CDLGAPSIDESIDEWHITE",
    "labelEn": "Up/Down-gap side-by-side white lines",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlgravestonedoji",
    "func": "CDLGRAVESTONEDOJI",
    "labelEn": "Gravestone Doji",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlhammer",
    "func": "CDLHAMMER",
    "labelEn": "Hammer",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlhangingman",
    "func": "CDLHANGINGMAN",
    "labelEn": "Hanging Man",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlharami",
    "func": "CDLHARAMI",
    "labelEn": "Harami Pattern",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlharamicross",
    "func": "CDLHARAMICROSS",
    "labelEn": "Harami Cross Pattern",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlhighwave",
    "func": "CDLHIGHWAVE",
    "labelEn": "High-Wave Candle",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlhikkake",
    "func": "CDLHIKKAKE",
    "labelEn": "Hikkake Pattern",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlhikkakemod",
    "func": "CDLHIKKAKEMOD",
    "labelEn": "Modified Hikkake Pattern",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlhomingpigeon",
    "func": "CDLHOMINGPIGEON",
    "labelEn": "Homing Pigeon",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlidentical3crows",
    "func": "CDLIDENTICAL3CROWS",
    "labelEn": "Identical Three Crows",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlinneck",
    "func": "CDLINNECK",
    "labelEn": "In-Neck Pattern",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlinvertedhammer",
    "func": "CDLINVERTEDHAMMER",
    "labelEn": "Inverted Hammer",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlkicking",
    "func": "CDLKICKING",
    "labelEn": "Kicking",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlkickingbylength",
    "func": "CDLKICKINGBYLENGTH",
    "labelEn": "Kicking - bull/bear determined by the longer marubozu",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlladderbottom",
    "func": "CDLLADDERBOTTOM",
    "labelEn": "Ladder Bottom",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdllongleggeddoji",
    "func": "CDLLONGLEGGEDDOJI",
    "labelEn": "Long Legged Doji",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdllongline",
    "func": "CDLLONGLINE",
    "labelEn": "Long Line Candle",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlmarubozu",
    "func": "CDLMARUBOZU",
    "labelEn": "Marubozu",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlmatchinglow",
    "func": "CDLMATCHINGLOW",
    "labelEn": "Matching Low",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlmathold",
    "func": "CDLMATHOLD",
    "labelEn": "Mat Hold",
    "category": "Pattern Recognition",
    "params": [
      {
        "name": "penetration",
        "jsonName": "penetration",
        "type": "float",
        "default": 0.3
      }
    ]
  },
  {
    "key": "cdlmorningdojistar",
    "func": "CDLMORNINGDOJISTAR",
    "labelEn": "Morning Doji Star",
    "category": "Pattern Recognition",
    "params": [
      {
        "name": "penetration",
        "jsonName": "penetration",
        "type": "float",
        "default": 0.3
      }
    ]
  },
  {
    "key": "cdlmorningstar",
    "func": "CDLMORNINGSTAR",
    "labelEn": "Morning Star",
    "category": "Pattern Recognition",
    "params": [
      {
        "name": "penetration",
        "jsonName": "penetration",
        "type": "float",
        "default": 0.3
      }
    ]
  },
  {
    "key": "cdlonneck",
    "func": "CDLONNECK",
    "labelEn": "On-Neck Pattern",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlpiercing",
    "func": "CDLPIERCING",
    "labelEn": "Piercing Pattern",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlrickshawman",
    "func": "CDLRICKSHAWMAN",
    "labelEn": "Rickshaw Man",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlrisefall3methods",
    "func": "CDLRISEFALL3METHODS",
    "labelEn": "Rising/Falling Three Methods",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlseparatinglines",
    "func": "CDLSEPARATINGLINES",
    "labelEn": "Separating Lines",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlshootingstar",
    "func": "CDLSHOOTINGSTAR",
    "labelEn": "Shooting Star",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlshortline",
    "func": "CDLSHORTLINE",
    "labelEn": "Short Line Candle",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlspinningtop",
    "func": "CDLSPINNINGTOP",
    "labelEn": "Spinning Top",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlstalledpattern",
    "func": "CDLSTALLEDPATTERN",
    "labelEn": "Stalled Pattern",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlsticksandwich",
    "func": "CDLSTICKSANDWICH",
    "labelEn": "Stick Sandwich",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdltakuri",
    "func": "CDLTAKURI",
    "labelEn": "Takuri (Dragonfly Doji with very long lower shadow)",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdltasukigap",
    "func": "CDLTASUKIGAP",
    "labelEn": "Tasuki Gap",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlthrusting",
    "func": "CDLTHRUSTING",
    "labelEn": "Thrusting Pattern",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdltristar",
    "func": "CDLTRISTAR",
    "labelEn": "Tristar Pattern",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlunique3river",
    "func": "CDLUNIQUE3RIVER",
    "labelEn": "Unique 3 River",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlupsidegap2crows",
    "func": "CDLUPSIDEGAP2CROWS",
    "labelEn": "Upside Gap Two Crows",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "cdlxsidegap3methods",
    "func": "CDLXSIDEGAP3METHODS",
    "labelEn": "Upside/Downside Gap Three Methods",
    "category": "Pattern Recognition",
    "params": []
  },
  {
    "key": "avgprice",
    "func": "AVGPRICE",
    "labelEn": "Average Price",
    "category": "Price Transform",
    "params": []
  },
  {
    "key": "medprice",
    "func": "MEDPRICE",
    "labelEn": "Median Price",
    "category": "Price Transform",
    "params": []
  },
  {
    "key": "typprice",
    "func": "TYPPRICE",
    "labelEn": "Typical Price",
    "category": "Price Transform",
    "params": []
  },
  {
    "key": "wclprice",
    "func": "WCLPRICE",
    "labelEn": "Weighted Close Price",
    "category": "Price Transform",
    "params": []
  },
  {
    "key": "beta",
    "func": "BETA",
    "labelEn": "Beta",
    "category": "Statistic",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "correl",
    "func": "CORREL",
    "labelEn": "Pearson's Correlation Coefficient (r)",
    "category": "Statistic",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "linearreg",
    "func": "LINEARREG",
    "labelEn": "Linear Regression",
    "category": "Statistic",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "linearreg_angle",
    "func": "LINEARREG_ANGLE",
    "labelEn": "Linear Regression Angle",
    "category": "Statistic",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "linearreg_intercept",
    "func": "LINEARREG_INTERCEPT",
    "labelEn": "Linear Regression Intercept",
    "category": "Statistic",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "linearreg_slope",
    "func": "LINEARREG_SLOPE",
    "labelEn": "Linear Regression Slope",
    "category": "Statistic",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "stddev",
    "func": "STDDEV",
    "labelEn": "Standard Deviation",
    "category": "Statistic",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      },
      {
        "name": "nb_dev",
        "jsonName": "nbDev",
        "type": "float",
        "default": 1
      }
    ]
  },
  {
    "key": "tsf",
    "func": "TSF",
    "labelEn": "Time Series Forecast",
    "category": "Statistic",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "var",
    "func": "VAR",
    "labelEn": "Variance",
    "category": "Statistic",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      },
      {
        "name": "nb_dev",
        "jsonName": "nbDev",
        "type": "float",
        "default": 1
      }
    ]
  },
  {
    "key": "atr",
    "func": "ATR",
    "labelEn": "Average True Range",
    "category": "Volatility",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "natr",
    "func": "NATR",
    "labelEn": "Normalized Average True Range",
    "category": "Volatility",
    "params": [
      {
        "name": "period",
        "jsonName": "period",
        "type": "int",
        "default": 14
      }
    ]
  },
  {
    "key": "trange",
    "func": "TRANGE",
    "labelEn": "True Range",
    "category": "Volatility",
    "params": []
  },
  {
    "key": "ad",
    "func": "AD",
    "labelEn": "Chaikin A/D Line",
    "category": "Volume",
    "params": []
  },
  {
    "key": "adosc",
    "func": "ADOSC",
    "labelEn": "Chaikin A/D Oscillator",
    "category": "Volume",
    "params": [
      {
        "name": "fast_period",
        "jsonName": "fastPeriod",
        "type": "int",
        "default": 12
      },
      {
        "name": "slow_period",
        "jsonName": "slowPeriod",
        "type": "int",
        "default": 26
      }
    ]
  },
  {
    "key": "obv",
    "func": "OBV",
    "labelEn": "On Balance Volume",
    "category": "Volume",
    "params": []
  }
];

export const ENUMS: Record<string, EnumValue[]> = {
  "MAType": [
    {
      "value": "MA_TYPE_SMA",
      "labelEn": "Ma Type Sma"
    },
    {
      "value": "MA_TYPE_EMA",
      "labelEn": "Ma Type Ema"
    },
    {
      "value": "MA_TYPE_WMA",
      "labelEn": "Ma Type Wma"
    },
    {
      "value": "MA_TYPE_DEMA",
      "labelEn": "Ma Type Dema"
    },
    {
      "value": "MA_TYPE_TEMA",
      "labelEn": "Ma Type Tema"
    },
    {
      "value": "MA_TYPE_TRIMA",
      "labelEn": "Ma Type Trima"
    },
    {
      "value": "MA_TYPE_KAMA",
      "labelEn": "Ma Type Kama"
    },
    {
      "value": "MA_TYPE_MAMA",
      "labelEn": "Ma Type Mama"
    },
    {
      "value": "MA_TYPE_T3",
      "labelEn": "Ma Type T3"
    }
  ],
  "PriceField": [
    {
      "value": "PRICE_CLOSE",
      "labelEn": "Price Close"
    },
    {
      "value": "PRICE_OPEN",
      "labelEn": "Price Open"
    },
    {
      "value": "PRICE_HIGH",
      "labelEn": "Price High"
    },
    {
      "value": "PRICE_LOW",
      "labelEn": "Price Low"
    },
    {
      "value": "PRICE_VOLUME",
      "labelEn": "Price Volume"
    },
    {
      "value": "PRICE_HL2",
      "labelEn": "(high + low) / 2"
    },
    {
      "value": "PRICE_HLC3",
      "labelEn": "(high + low + close) / 3"
    },
    {
      "value": "PRICE_OHLC4",
      "labelEn": "(open + high + low + close) / 4"
    }
  ],
  "CompareOp": [
    {
      "value": "COMPARE_OP_GT",
      "labelEn": "Compare Op Gt"
    },
    {
      "value": "COMPARE_OP_GE",
      "labelEn": "Compare Op Ge"
    },
    {
      "value": "COMPARE_OP_LT",
      "labelEn": "Compare Op Lt"
    },
    {
      "value": "COMPARE_OP_LE",
      "labelEn": "Compare Op Le"
    },
    {
      "value": "COMPARE_OP_EQ",
      "labelEn": "Compare Op Eq"
    },
    {
      "value": "COMPARE_OP_NE",
      "labelEn": "Compare Op Ne"
    },
    {
      "value": "COMPARE_OP_CROSSES_ABOVE",
      "labelEn": "left пересекает right снизу вверх на этом баре"
    },
    {
      "value": "COMPARE_OP_CROSSES_BELOW",
      "labelEn": "left пересекает right сверху вниз на этом баре"
    }
  ],
  "ArithOp": [
    {
      "value": "ARITH_OP_ADD",
      "labelEn": "Arith Op Add"
    },
    {
      "value": "ARITH_OP_SUB",
      "labelEn": "Arith Op Sub"
    },
    {
      "value": "ARITH_OP_MUL",
      "labelEn": "Arith Op Mul"
    },
    {
      "value": "ARITH_OP_DIV",
      "labelEn": "Arith Op Div"
    }
  ]
};

export const INDICATOR_BY_KEY: Record<string, IndicatorDef> = Object.fromEntries(
  INDICATORS.map((i) => [i.key, i]),
);
