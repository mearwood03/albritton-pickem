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
  // Weekly winners set by hand for weeks played on the site (use the name shown on the site).
  // Overrides what the site works out from the scores and tiebreaker.
  winnerOverrides: {
    6: ['Papi'], // Trey Hood
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
