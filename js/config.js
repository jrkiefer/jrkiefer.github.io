    // js/config.js — no dependencies (loaded first)
    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbysGE_0ynpVxJNdmvsfPjAdkQA3Lng7YMDp1OjP-EXbdx3xqEixgjwCKxVeSisECo-j/exec';
    const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1MVjVlKd3pwXB_JkHZkP00FnM0fBerfwStfqJ-GBza0M/edit?gid=0#gid=0';

    const DOUGH_TABLE = [
      { threshold: 3750,  indi: 11, small: 52,  large: 44,  sic: 2 },
      { threshold: 4000,  indi: 12, small: 58,  large: 50,  sic: 2 },
      { threshold: 4400,  indi: 13, small: 63,  large: 56,  sic: 2 },
      { threshold: 4800,  indi: 14, small: 69,  large: 62,  sic: 2 },
      { threshold: 5200,  indi: 15, small: 74,  large: 65,  sic: 2 },
      { threshold: 5700,  indi: 17, small: 81,  large: 72,  sic: 2 },
      { threshold: 6300,  indi: 18, small: 88,  large: 79,  sic: 2 },
      { threshold: 6800,  indi: 20, small: 94,  large: 87,  sic: 3 },
      { threshold: 7200,  indi: 21, small: 101, large: 94,  sic: 3 },
      { threshold: 7800,  indi: 22, small: 108, large: 99,  sic: 3 },
      { threshold: 8300,  indi: 24, small: 115, large: 106, sic: 3 },
      { threshold: 9100,  indi: 26, small: 125, large: 117, sic: 3 },
      { threshold: 10000, indi: 28, small: 136, large: 126, sic: 4 },
      { threshold: 10700, indi: 30, small: 146, large: 137, sic: 4 },
      { threshold: 11500, indi: 32, small: 156, large: 148, sic: 4 },
      { threshold: 12250, indi: 34, small: 166, large: 159, sic: 4 },
      { threshold: 13000, indi: 37, small: 177, large: 166, sic: 5 },
      { threshold: 13900, indi: 39, small: 187, large: 177, sic: 5 },
      { threshold: 14750, indi: 41, small: 197, large: 188, sic: 5 },
      { threshold: 15500, indi: 43, small: 206, large: 195, sic: 5 },
      { threshold: 16250, indi: 44, small: 214, large: 205, sic: 6 },
      { threshold: 17000, indi: 44, small: 225, large: 216, sic: 6 },
      { threshold: 17750, indi: 44, small: 235, large: 225, sic: 6 },
      { threshold: 18500, indi: 44, small: 246, large: 237, sic: 6 },
      { threshold: 19250, indi: 44, small: 255, large: 247, sic: 6 },
      { threshold: 20000, indi: 44, small: 266, large: 256, sic: 7 },
      { threshold: 20750, indi: 44, small: 276, large: 267, sic: 7 },
    ];

    const PER_TRAY = { indi: 11, small: 8, large: 6, sic: 3 };
    const TRAYS_PER_BATCH = 11;
    const TYPES = ['indi', 'small', 'large', 'sic'];
    const TYPE_LABELS = { indi: 'Individual', small: 'Small', large: 'Large', sic: 'Sicilian' };
    const TYPE_COLORS = { indi: '#FF9800', small: '#2196F3', large: '#9C27B0', sic: '#4CAF50' };
    const TYPE_SHORT = { indi: 'Indi', small: 'Sm', large: 'Lg', sic: 'Sic' };

    const BOIL_TARGET = 36;
    const BOIL_PER_TRAY = 6;
