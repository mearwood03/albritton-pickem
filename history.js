// Weeks 1–5, from the spreadsheet (before the pool moved to this site).
// They show on the Leaderboard's Season tab and count toward season totals.
//
// wins:    right picks per entry, from the sheet's WINS column.
// games:   games that were graded that week (wrong = games − wins; a tied NFL game counts for nobody).
// winners: the week's winner(s). Leave [] if it isn't settled yet.
// aliases: spreadsheet name → the name that person uses on the website, so their
//          weeks 1–5 join up with the rest of their season. Fix one here if it's wrong.
//          "#2" entries are second entries the same person played that week; they get their own row.
window.PICKEM_HISTORY = {
  aliases: {
    'Henry Albritton': 'Hank Albritton',
    'Blake Albritton': 'Blake',
    'Evan Collins': 'Evan',
    'Dave Rano': 'Rano',
    'JR Harrington': 'John Harrington',
    'Ryan Griffith': 'Ryan G',
    'Ben Hoversland': 'Benjamin Hoversland',
    'Triston Allen': 'Triston',
    'Barry Lanier': 'Barry',
    'Eddie Yoho': 'Eddie yoho',
    'Anthony M': 'ANTHONY MONTECALVO',
    'Ethan C': 'Ethan',
    'Mike Puffer': 'MIKE P',
    'Rachel Collins': 'Rach',
    'Tim Martin': 'Timbo',
    'Brandon Lanier': 'Brandon',
    'Trey Hood': 'Papi',
  },
  // Spreadsheet name → that person's site account id. Pins weeks 1–5 to their account, so it keeps
  // working if they change the name they use on the site. (Used before the name-based aliases above.)
  accounts: {
    'Alex Bull': 'DAIGFTIgfKRgxnTVGqaiWW5sJp23',
    'Anthony M': 'XLZZSmzkurN6oy3v0yWYnKt99GB3',
    'Barry Lanier': 'N9nmOnFYLbalWlb57jCagCsnNm23',
    'Ben Hoversland': 'b7djiTSaDTZvqtwmWYbIi1AWcmr1',
    'Blake Albritton': 'O1NCQ8eaSsSewIjbXQrqJGhT3X13',
    'Brandon Lanier': 'cHNoP7J5ZJPmuozj1tmewu11cJ93',
    'Dave Rano': '7bJxZj4mHDZVDN9JujzljVK30jI3',
    'Duane Wisor': 'An4vzrErXzZkrn1K6TtYX2q67A43',
    'Dwight Samuel': '2eQ8RZfEwJTGBq9jEKmm0UL9J1G2',
    'Eddie Yoho': 'bbK6fVFXuoS7xcZ9cYfqoKzIO9f1',
    'Ethan C': 'No3VEFkanLTDNXLC0ur3MUXfoQN2',
    'Evan Collins': 'BmwE80vribU8MVQoC9K4BIagcYg2',
    'Henry Albritton': 'kdcV9uFqGhTXFcg1TuS6oafMA733',
    'JR Harrington': 'jEhg7JifxqN6jFEwOLhnDn5Y9qq2',
    'Jason Hill': '0i0mH1kcQHRuqh4IuuXf6VmJXHI2',
    'Kyler Nowling': 'r2f1bHlroCV0zqAulxd38tBO1tO2',
    'Micah Earwood': 'auwHWBUnVuTEj3AjSEwQ8ppUm6C2',
    'Mike Puffer': 'rnkXMhuBJJNcLORNj6Zv6pg61Rp2',
    'Rachel Collins': 'clIKI0TPloR0H6g3m9dtHirbxHH3',
    'Ryan Griffith': 'nLn5TC28GOZCwn3k2zFzYuoJ48E3',
    'Scott Cole': 'aW0gHorKCdQUi9358wyLSLdmUbc2',
    'Tim Martin': 'PJBMubOILYQu6sMLfTnKkhcoL5s1',
    'Trey Hood': 'Vzqp1bVNDERBskWTnmpsOdSlfqG3',
    'Triston Allen': '0OM2O0Iw8VhgvSGkd6Gk1KHG0Nu1',
  },
  // Weekly winners set by hand for weeks played on the site (site account id, or the name shown on the site).
  // Overrides what the site works out from the scores and tiebreaker.
  winnerOverrides: {
    6: ['Vzqp1bVNDERBskWTnmpsOdSlfqG3'], // Trey Hood (Papi) — site account id, so renames don't matter
  },
  // Final scores for weeks played on the site before it saved results itself (from ESPN, all final).
  // h/a = home/away team, hs/as = points, w = winner ('' = tie), k = kickoff (ms).
  results: {
    '2026-6': {
      g_401872995: {"h": "DEN", "hn": "Broncos", "hf": "Denver Broncos", "hs": 17, "a": "SEA", "an": "Seahawks", "af": "Seattle Seahawks", "as": 14, "w": "DEN", "k": 1792109700000, "v": false},
      g_401872996: {"h": "JAX", "hn": "Jaguars", "hf": "Jacksonville Jaguars", "hs": 31, "a": "HOU", "an": "Texans", "af": "Houston Texans", "as": 34, "w": "HOU", "k": 1792330200000, "v": false},
      g_401872999: {"h": "ATL", "hn": "Falcons", "hf": "Atlanta Falcons", "hs": 23, "a": "CHI", "an": "Bears", "af": "Chicago Bears", "as": 31, "w": "CHI", "k": 1792342800000, "v": false},
      g_401872997: {"h": "CLE", "hn": "Browns", "hf": "Cleveland Browns", "hs": 13, "a": "BAL", "an": "Ravens", "af": "Baltimore Ravens", "as": 10, "w": "CLE", "k": 1792342800000, "v": false},
      g_401873003: {"h": "IND", "hn": "Colts", "hf": "Indianapolis Colts", "hs": 20, "a": "TEN", "an": "Titans", "af": "Tennessee Titans", "as": 26, "w": "TEN", "k": 1792342800000, "v": false},
      g_401873001: {"h": "NE", "hn": "Patriots", "hf": "New England Patriots", "hs": 26, "a": "NYJ", "an": "Jets", "af": "New York Jets", "as": 19, "w": "NE", "k": 1792342800000, "v": false},
      g_401873000: {"h": "NYG", "hn": "Giants", "hf": "New York Giants", "hs": 27, "a": "NO", "an": "Saints", "af": "New Orleans Saints", "as": 34, "w": "NO", "k": 1792342800000, "v": false},
      g_401872998: {"h": "PHI", "hn": "Eagles", "hf": "Philadelphia Eagles", "hs": 14, "a": "CAR", "an": "Panthers", "af": "Carolina Panthers", "as": 25, "w": "CAR", "k": 1792342800000, "v": false},
      g_401873002: {"h": "TB", "hn": "Buccaneers", "hf": "Tampa Bay Buccaneers", "hs": 19, "a": "PIT", "an": "Steelers", "af": "Pittsburgh Steelers", "as": 26, "w": "PIT", "k": 1792342800000, "v": false},
      g_401873004: {"h": "LAR", "hn": "Rams", "hf": "Los Angeles Rams", "hs": 16, "a": "ARI", "an": "Cardinals", "af": "Arizona Cardinals", "as": 18, "w": "ARI", "k": 1792353900000, "v": false},
      g_401873006: {"h": "KC", "hn": "Chiefs", "hf": "Kansas City Chiefs", "hs": 22, "a": "LAC", "an": "Chargers", "af": "Los Angeles Chargers", "as": 6, "w": "KC", "k": 1792355100000, "v": false},
      g_401873005: {"h": "LV", "hn": "Raiders", "hf": "Las Vegas Raiders", "hs": 30, "a": "BUF", "an": "Bills", "af": "Buffalo Bills", "as": 33, "w": "BUF", "k": 1792355100000, "v": false},
      g_401873007: {"h": "GB", "hn": "Packers", "hf": "Green Bay Packers", "hs": 23, "a": "DAL", "an": "Cowboys", "af": "Dallas Cowboys", "as": 13, "w": "GB", "k": 1792369200000, "v": false},
      g_401873008: {"h": "SF", "hn": "49ers", "hf": "San Francisco 49ers", "hs": 23, "a": "WSH", "an": "Commanders", "af": "Washington Commanders", "as": 17, "w": "SF", "k": 1792455300000, "v": false},
    },
    '2026-7': {
      g_401873010: {"h": "CHI", "hn": "Bears", "hf": "Chicago Bears", "hs": 30, "a": "NE", "an": "Patriots", "af": "New England Patriots", "as": 24, "w": "CHI", "k": 1792714500000, "v": false},
      g_401873011: {"h": "NO", "hn": "Saints", "hf": "New Orleans Saints", "hs": 10, "a": "PIT", "an": "Steelers", "af": "Pittsburgh Steelers", "as": 16, "w": "PIT", "k": 1792935000000, "v": false},
      g_401873017: {"h": "ATL", "hn": "Falcons", "hf": "Atlanta Falcons", "hs": 29, "a": "SF", "an": "49ers", "af": "San Francisco 49ers", "as": 20, "w": "ATL", "k": 1792947600000, "v": false},
      g_401873013: {"h": "TEN", "hn": "Titans", "hf": "Tennessee Titans", "hs": 24, "a": "CLE", "an": "Browns", "af": "Cleveland Browns", "as": 27, "w": "CLE", "k": 1792947600000, "v": false},
      g_401873014: {"h": "MIN", "hn": "Vikings", "hf": "Minnesota Vikings", "hs": 16, "a": "IND", "an": "Colts", "af": "Indianapolis Colts", "as": 10, "w": "MIN", "k": 1792947600000, "v": false},
      g_401873015: {"h": "NYJ", "hn": "Jets", "hf": "New York Jets", "hs": 25, "a": "MIA", "an": "Dolphins", "af": "Miami Dolphins", "as": 28, "w": "MIA", "k": 1792947600000, "v": false},
      g_401873018: {"h": "CAR", "hn": "Panthers", "hf": "Carolina Panthers", "hs": 13, "a": "TB", "an": "Buccaneers", "af": "Tampa Bay Buccaneers", "as": 43, "w": "TB", "k": 1792947600000, "v": false},
      g_401873012: {"h": "BAL", "hn": "Ravens", "hf": "Baltimore Ravens", "hs": 13, "a": "CIN", "an": "Bengals", "af": "Cincinnati Bengals", "as": 35, "w": "CIN", "k": 1792947600000, "v": false},
      g_401873016: {"h": "HOU", "hn": "Texans", "hf": "Houston Texans", "hs": 21, "a": "NYG", "an": "Giants", "af": "New York Giants", "as": 27, "w": "NYG", "k": 1792947600000, "v": false},
      g_401873019: {"h": "ARI", "hn": "Cardinals", "hf": "Arizona Cardinals", "hs": 16, "a": "DEN", "an": "Broncos", "af": "Denver Broncos", "as": 30, "w": "DEN", "k": 1792958700000, "v": false},
      g_401873020: {"h": "DET", "hn": "Lions", "hf": "Detroit Lions", "hs": 20, "a": "GB", "an": "Packers", "af": "Green Bay Packers", "as": 17, "w": "DET", "k": 1792959900000, "v": false},
      g_401873021: {"h": "LV", "hn": "Raiders", "hf": "Las Vegas Raiders", "hs": 21, "a": "LAR", "an": "Rams", "af": "Los Angeles Rams", "as": 35, "w": "LAR", "k": 1792959900000, "v": false},
      g_401873022: {"h": "SEA", "hn": "Seahawks", "hf": "Seattle Seahawks", "hs": 20, "a": "KC", "an": "Chiefs", "af": "Kansas City Chiefs", "as": 3, "w": "SEA", "k": 1792974000000, "v": false},
      g_401873009: {"h": "PHI", "hn": "Eagles", "hf": "Philadelphia Eagles", "hs": 21, "a": "DAL", "an": "Cowboys", "af": "Dallas Cowboys", "as": 38, "w": "DAL", "k": 1793060100000, "v": false},
    },
    '2026-8': {
      g_401873023: {"h": "GB", "hn": "Packers", "hf": "Green Bay Packers", "hs": 27, "a": "CAR", "an": "Panthers", "af": "Carolina Panthers", "as": 19, "w": "GB", "k": 1793319300000, "v": false},
      g_401873026: {"h": "BUF", "hn": "Bills", "hf": "Buffalo Bills", "hs": 36, "a": "BAL", "an": "Ravens", "af": "Baltimore Ravens", "as": 10, "w": "BUF", "k": 1793556000000, "v": false},
      g_401873031: {"h": "CIN", "hn": "Bengals", "hf": "Cincinnati Bengals", "hs": 43, "a": "TEN", "an": "Titans", "af": "Tennessee Titans", "as": 36, "w": "CIN", "k": 1793556000000, "v": false},
      g_401873024: {"h": "DAL", "hn": "Cowboys", "hf": "Dallas Cowboys", "hs": 30, "a": "ARI", "an": "Cardinals", "af": "Arizona Cardinals", "as": 33, "w": "ARI", "k": 1793556000000, "v": false},
      g_401873030: {"h": "DET", "hn": "Lions", "hf": "Detroit Lions", "hs": 19, "a": "MIN", "an": "Vikings", "af": "Minnesota Vikings", "as": 15, "w": "DET", "k": 1793556000000, "v": false},
      g_401873029: {"h": "NYJ", "hn": "Jets", "hf": "New York Jets", "hs": 33, "a": "LV", "an": "Raiders", "af": "Las Vegas Raiders", "as": 38, "w": "LV", "k": 1793556000000, "v": false},
      g_401873027: {"h": "PIT", "hn": "Steelers", "hf": "Pittsburgh Steelers", "hs": 27, "a": "CLE", "an": "Browns", "af": "Cleveland Browns", "as": 6, "w": "PIT", "k": 1793556000000, "v": false},
      g_401873025: {"h": "TB", "hn": "Buccaneers", "hf": "Tampa Bay Buccaneers", "hs": 16, "a": "ATL", "an": "Falcons", "af": "Atlanta Falcons", "as": 0, "w": "TB", "k": 1793556000000, "v": false},
      g_401873028: {"h": "JAX", "hn": "Jaguars", "hf": "Jacksonville Jaguars", "hs": 42, "a": "IND", "an": "Colts", "af": "Indianapolis Colts", "as": 7, "w": "JAX", "k": 1793556000000, "v": false},
      g_401873032: {"h": "LAR", "hn": "Rams", "hf": "Los Angeles Rams", "hs": 24, "a": "LAC", "an": "Chargers", "af": "Los Angeles Chargers", "as": 9, "w": "LAR", "k": 1793567100000, "v": false},
      g_401873033: {"h": "DEN", "hn": "Broncos", "hf": "Denver Broncos", "hs": 28, "a": "KC", "an": "Chiefs", "af": "Kansas City Chiefs", "as": 24, "w": "DEN", "k": 1793568300000, "v": false},
      g_401873034: {"h": "MIA", "hn": "Dolphins", "hf": "Miami Dolphins", "hs": 19, "a": "NE", "an": "Patriots", "af": "New England Patriots", "as": 24, "w": "NE", "k": 1793568300000, "v": false},
      g_401873035: {"h": "WSH", "hn": "Commanders", "hf": "Washington Commanders", "hs": 27, "a": "PHI", "an": "Eagles", "af": "Philadelphia Eagles", "as": 10, "w": "WSH", "k": 1793582400000, "v": false},
      g_401873036: {"h": "SEA", "hn": "Seahawks", "hf": "Seattle Seahawks", "hs": 17, "a": "CHI", "an": "Bears", "af": "Chicago Bears", "as": 34, "w": "CHI", "k": 1793668500000, "v": false},
    },
  },
  weeks: {
    1: {
      games: 15, // MNF (DEN @ KC) wasn't graded on the sheet
      winners: ['JR Harrington'], // won the tiebreaker over Mike Puffer, JR Harrington #2 and Trey Hood (all 11)
      wins: {
        'Evan Collins': 8, 'Dave Rano': 9, 'Blake Albritton': 9, 'Brandon Lanier': 8, 'Scott Cole': 10,
        'Ethan C': 10, 'Chris Weaver': 10, 'Denia Rano': 9, 'Mike Puffer': 11, 'Blake Ozack': 10,
        'Micah Earwood': 8, 'Jason Hill': 8, 'Barry Lanier': 10, 'Rodney Lanier': 9, 'JR Harrington': 11,
        'JR Harrington #2': 11, 'Henry Albritton': 6, 'Ethan C #2': 9, 'Kyler Nowling': 10, 'Xavier Y': 10,
        'Trey Hood': 11,
      },
    },
    2: {
      games: 15, // IND @ KC wasn't graded on the sheet
      winners: ['Evan Collins'],
      wins: {
        'Trey Hood': 9, 'Barry Lanier': 9, 'Rodney Lanier': 8, 'Evan Collins': 12, 'Evan Collins #2': 6,
        'Brandon Lanier': 8, 'Ethan C': 9, 'Blake Albritton': 10, 'Scott Cole': 8, 'Eddie Yoho': 10,
        'Eddie Yoho #2': 7, 'Henry Albritton': 8, 'Kyler Nowling': 9, 'Alex Bull': 9, 'Micah Earwood': 7,
        'Duane Wisor': 9, 'Dave Rano': 8, 'Denia Rano': 9, 'Jason Hill': 9, 'JR Harrington': 6,
        'Dwight Samuel': 8,
      },
    },
    3: {
      games: 16,
      winners: ['Alex Bull'], // won the tiebreaker over Triston Allen (both 11)
      wins: {
        'Denia Rano': 6, 'Alex Bull': 11, 'Trey Hood': 9, 'Trey Hood #2': 7, 'Kyler Nowling': 7,
        'Jason Hill': 9, 'Scott Cole': 5, 'Dwight Samuel': 10, 'Evan Collins': 8, 'Rachel Collins': 9,
        'Dave Rano': 9, 'Eddie Yoho': 6, 'Henry Albritton': 7, 'JR Harrington': 7, 'Blake Albritton': 9,
        'Ethan C': 6, 'Duane Wisor': 8, 'Ben Hoversland': 6, 'Barry Lanier': 9, 'Triston Allen': 11,
        'Rodney Lanier': 4,
      },
    },
    4: {
      games: 16,
      winners: ['Tim Martin'],
      wins: {
        'JR Harrington': 12, 'Blake Ozack': 8, 'Trey Hood': 9, 'Tim Martin': 13, 'Barry Lanier': 11,
        'Duane Wisor': 11, 'Kyler Nowling': 10, 'Dave Rano': 8, 'Jason Hill': 9, 'Alex Bull': 12,
        'Dwight Samuel': 9, 'Henry Albritton': 11, 'Rachel Collins': 6, 'Evan Collins': 10, 'Triston Allen': 11,
        'Ryan Griffith': 10, 'Ben Hoversland': 10, 'Scott Cole': 8, 'Eddie Yoho': 11, 'Blake Albritton': 11,
      },
    },
    5: {
      games: 14, // 15 games, NYG @ WAS ended in a tie
      winners: ['Scott Cole'],
      wins: {
        'Trey Hood': 8, 'Jason Hill': 8, 'Duane Wisor': 5, 'Henry Albritton': 6, 'Ben Hoversland': 6,
        'Ryan Griffith': 10, 'Scott Cole': 11, 'Alex Bull': 6, 'Brandon Lanier': 8, 'Blake Ozack': 7,
        'Tim Martin': 9, 'Evan Collins': 9, 'Triston Allen': 9, 'JR Harrington': 8, 'Dave Rano': 5,
        'Anthony M': 7, 'Kyler Nowling': 7, 'Eddie Yoho': 9, 'Blake Albritton': 8, 'Dwight Samuel': 8,
      },
    },
  },
};
