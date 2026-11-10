// aBetterMyGCC demo: a stand-in for the myGCC (Jenzabar JICS) server.
// Used only by the extension's own demo page (demo/index.html), never on my.gcc.edu.
// handle(method, url, body) returns a whole page of JICS-shaped HTML for a myGCC
// URL, so the real content scripts can parse it exactly as they parse myGCC.
// Every person, course, room, number and page below is made up.
(function () {
  'use strict';

  const USER = 'Demo Student';
  const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAY = 864e5;
  const mdy = (d) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

  // ---------- terms, relative to today so the demo never goes stale ----------
  const now = new Date();
  const Y = now.getFullYear();
  const fall = (y) => ({ value: `${y};10`, label: `Fall Semester ${y}` });
  const spring = (y) => ({ value: `${y - 1};30`, label: `Spring Semester ${y}` }); // academic year starts the fall before
  const autumn = now.getMonth() >= 7;
  const CUR = autumn ? fall(Y) : spring(Y);
  const NEXT = autumn ? spring(Y + 1) : fall(Y);
  const PREV = autumn ? spring(Y) : fall(Y - 1);
  const OLDER = autumn ? fall(Y - 1) : spring(Y - 1);
  const TERMS = [NEXT, CUR, PREV, OLDER]; // myGCC lists newest first
  const termOf = (v) => TERMS.find((t) => t.value === v) || CUR;
  const T_START = new Date(now.getTime() - 45 * DAY);
  const T_END = new Date(now.getTime() + 50 * DAY);

  // ---------- people and places (fictional) ----------
  const BLD = { HBR: 'Harbor Hall', LSC: 'Lindenwood Science Center', MAB: 'Maple Arts Building', ONL: 'Online' };

  // ---------- this term's schedule ----------
  // meet: [days, start, end, building, room]
  const SCHEDULE = [
    { code: 'COMP 205 A', title: 'DATA STRUCTURES', prof: 'Penwright, Dr. Tomas', cr: 3, meet: [['MWF', '9:00', '9:50 AM', 'HBR', '214']] },
    { code: 'MATH 213 B', title: 'LINEAR ALGEBRA', prof: 'Ashgrove, Dr. Lena', cr: 3, meet: [['MWF', '11:00', '11:50 AM', 'LSC', '120']] },
    { code: 'HUMA 210 C', title: 'GREAT BOOKS SEMINAR', prof: 'Underhill, Dr. Rosa', cr: 3, meet: [['TR', '9:30', '10:45 AM', 'MAB', '101']] },
    { code: 'PHYS 101 A', title: 'GENERAL PHYSICS I', prof: 'Calloway, Dr. Jun', cr: 4, meet: [['TR', '1:00', '2:15 PM', 'LSC', '008'], ['W', '2:00', '3:50 PM', 'LSC', '015']] },
    { code: 'MUSI 105 O', title: 'MUSIC APPRECIATION', prof: 'Sterling, Prof. Nadia', cr: 2, meet: [] },
  ];

  // ---------- next term's course catalog (Add/Drop search) ----------
  // s: [days, "9:00 AM-9:50 AM"] ; seats [open, cap]
  const C = (code, title, prof, cr, sched, bld, room, open, cap, ref) => ({ code, title, prof, cr, sched, bld, room, open, cap, ref });
  const CATALOG = [
    C('COMP 220 A', 'SOFTWARE ENGINEERING', 'Penwright, Tomas', 3, [['MWF', '10:00 AM-10:50 AM']], 'HBR', '214', 4, 30, 41201),
    C('COMP 220 B', 'SOFTWARE ENGINEERING', 'Halvorsen, Ingrid', 3, [['TR', '1:00 PM-2:15 PM']], 'HBR', '216', 11, 30, 41202),
    C('COMP 233 A', 'COMPUTER ORGANIZATION', 'Vantreese, Owen', 3, [['MWF', '1:00 PM-1:50 PM']], 'HBR', '214', 9, 28, 41210),
    C('COMP 314 A', 'ALGORITHMS', 'Halvorsen, Ingrid', 3, [['MWF', '11:00 AM-11:50 AM']], 'HBR', '220', 6, 28, 41220),
    C('COMP 340 A', 'OPERATING SYSTEMS', 'Vantreese, Owen', 3, [['TR', '11:00 AM-12:15 PM']], 'HBR', '220', 14, 28, 41230),
    C('COMP 350 A', 'DATABASE SYSTEMS', 'Penwright, Tomas', 3, [['MWF', '2:00 PM-2:50 PM']], 'HBR', '216', 0, 28, 41240),
    C('STAT 131 A', 'INTRO STATISTICS', 'Lindqvist, Mara', 3, [['MWF', '8:00 AM-8:50 AM']], 'LSC', '120', 0, 32, 42101),
    C('STAT 131 B', 'INTRO STATISTICS', 'Lindqvist, Mara', 3, [['MWF', '12:00 PM-12:50 PM']], 'LSC', '120', 6, 32, 42102),
    C('STAT 131 C', 'INTRO STATISTICS', 'Fairbanks, Theo', 3, [['TR', '9:30 AM-10:45 AM']], 'LSC', '122', 12, 32, 42103),
    C('MATH 214 A', 'CALCULUS III', 'Ashgrove, Lena', 4, [['MWF', '10:00 AM-10:50 AM'], ['R', '10:00 AM-10:50 AM']], 'LSC', '118', 3, 30, 42210),
    C('MATH 214 B', 'CALCULUS III', 'Fairbanks, Theo', 4, [['MTWR', '2:00 PM-2:50 PM']], 'LSC', '118', 15, 30, 42211),
    C('MATH 261 A', 'DISCRETE MATHEMATICS', 'Ashgrove, Lena', 3, [['TR', '11:00 AM-12:15 PM']], 'LSC', '124', 8, 30, 42220),
    C('PHYS 102 A', 'GENERAL PHYSICS II', 'Calloway, Jun', 4, [['TR', '9:30 AM-10:45 AM'], ['W', '2:00 PM-3:50 PM']], 'LSC', '008', 5, 40, 43101),
    C('HUMA 301 A', 'ETHICS & SOCIETY', 'Underhill, Rosa', 3, [['TR', '2:30 PM-3:45 PM']], 'MAB', '101', 10, 35, 44301),
    C('HUMA 303 A', 'MODERN LITERATURE SEM', 'Whitcombe, Clara', 3, [['MWF', '10:00 AM-10:50 AM']], 'MAB', '104', 7, 25, 44303),
    C('HUMA 310 O', 'ART & CULTURE ONLINE', 'Sterling, Nadia', 3, [], 'ONL', '', 20, 40, 44310),
    C('SPAN 202 A', 'INTERMEDIATE SPANISH II', 'Quintana, Rafael', 3, [['MWF', '9:00 AM-9:50 AM']], 'MAB', '210', 5, 24, 45202),
    C('SPAN 202 B', 'INTERMEDIATE SPANISH II', 'Quintana, Rafael', 3, [['TR', '8:00 AM-9:15 AM']], 'MAB', '210', 9, 24, 45203),
    C('BIOL 102 A', 'GENERAL BIOLOGY II', 'Brightwater, Eli', 4, [['MWF', '11:00 AM-11:50 AM']], 'LSC', '201', 13, 48, 46102),
    C('BIOL 102 L L', 'LABORATORY', 'Brightwater, Eli', 0, [['T', '1:00 PM-3:50 PM']], 'LSC', '210', 4, 16, 46103),
    C('BIOL 102 M L', 'LABORATORY', 'Marlowe, Ada', 0, [['R', '1:00 PM-3:50 PM']], 'LSC', '210', 10, 16, 46104),
    C('CHEM 112 A', 'GENERAL CHEMISTRY II', 'Delacroix-Hale, Simone', 3, [['MWF', '1:00 PM-1:50 PM']], 'LSC', '301', 18, 48, 47112),
    C('CHEM 114 A', 'GENERAL CHEMISTRY II LAB', 'Delacroix-Hale, Simone', 1, [['W', '2:00 PM-4:50 PM']], 'LSC', '310', 6, 20, 47114),
    C('ECON 101 A', 'PRINCIPLES OF MACROECON', 'Nakamura-Reyes, Elena', 3, [['MWF', '12:00 PM-12:50 PM']], 'HBR', '101', 22, 45, 48101),
    C('PSYC 101 A', 'GENERAL PSYCHOLOGY', 'Okafor, Daniel', 3, [['TR', '11:00 AM-12:15 PM']], 'HBR', '105', 0, 45, 48201),
    C('ENGL 210 A', 'CREATIVE WRITING', 'Whitcombe, Clara', 3, [['TR', '2:30 PM-3:45 PM']], 'MAB', '106', 3, 18, 48301),
    C('HIST 120 A', 'WORLD HISTORY II', 'Marlowe, Ada', 3, [['MWF', '9:00 AM-9:50 AM']], 'MAB', '110', 16, 40, 48401),
    C('MUSI 106 A', 'CLASS PIANO', 'Sterling, Nadia', 1, [['TR', '4:00 PM-4:50 PM']], 'MAB', '012', 2, 12, 48501),
  ];
  // Already registered for next term (shows conflicts and the Save lock)
  const NEXT_REGISTERED = ['MATH 214 A', 'PHYS 102 A'];
  const DEPTS = [...new Set(CATALOG.map((c) => c.code.split(' ')[0]))].sort();
  const schedText = (c) => (c.sched.length ? c.sched.map(([d, t]) => `${d} ${t}`).join(', ') + `; Main Campus, ${BLD[c.bld]}, ${c.room}` : 'Online; no set meeting time');

  // ---------- degree progress ----------
  const REQS = [
    { name: 'General Education Core', needed: 45, earned: 33, prog: 6,
      cats: [['Humanities', true, 12, 12], ['Foreign Language', false, 6, 3], ['Quantitative Reasoning', false, 6, 3], ['Natural Science', false, 8, 4]],
      rows: [
        ['HUMA101', 'Foundations of the Humanities', 'Met', 3, 3, 'C-', 'B+', 'HUMA 101', 'FOUNDATIONS OF HUMANITIES'],
        ['HUMA210', 'Great Books Seminar', 'In Progress', 3, 0, 'C-', '', 'HUMA 210', 'GREAT BOOKS SEMINAR'],
        ['HUMA301', 'Humanities: Ethics & Society', 'Required', 3, 0, 'C-', '', 'See available courses', ''],
        ['SPAN201', 'Intermediate Spanish I', 'Met', 3, 3, 'C-', 'A-', 'SPAN 201', 'INTERMEDIATE SPANISH I'],
        ['SPAN202', 'Intermediate Spanish II', 'Required', 3, 0, 'C-', '', 'See available courses', ''],
        ['STAT131', 'Introductory Statistics', 'Required', 3, 0, 'C-', '', 'See available courses', ''],
        ['PHYS101', 'General Physics I', 'In Progress', 4, 0, 'C-', '', 'PHYS 101', 'GENERAL PHYSICS I'],
      ] },
    { name: 'Computer Science Major', needed: 58, earned: 20, prog: 3,
      cats: [['Core Courses', false, 34, 14], ['Electives', false, 12, 6], ['Capstone', false, 6, 0]],
      rows: [
        ['COMP141', 'Introduction to Programming', 'Met', 3, 3, 'C-', 'A', 'COMP 141', 'INTRO TO PROGRAMMING'],
        ['COMP155', 'Object-Oriented Design', 'Met', 3, 3, 'C-', 'A-', 'COMP 155', 'OBJECT-ORIENTED DESIGN'],
        ['COMP205', 'Data Structures', 'In Progress', 3, 0, 'C-', '', 'COMP 205', 'DATA STRUCTURES'],
        ['COMP220', 'Software Engineering', 'Required', 3, 0, 'C-', '', 'See available courses', ''],
        ['COMP314', 'Algorithms', 'Required', 3, 0, 'C-', '', 'See available courses', ''],
        ['COMP340', 'Operating Systems', 'Required', 3, 0, 'C-', '', 'See available courses', ''],
      ] },
    { name: 'Mathematics Minor', needed: 18, earned: 8, prog: 3,
      cats: [['Calculus Sequence', false, 12, 8], ['Upper-Level Math', false, 6, 0]],
      rows: [
        ['MATH161', 'Calculus I', 'Met', 4, 4, 'C-', 'B', 'MATH 161', 'CALCULUS I'],
        ['MATH162', 'Calculus II', 'Met', 4, 4, 'C-', 'B+', 'MATH 162', 'CALCULUS II'],
        ['MATH213', 'Linear Algebra', 'In Progress', 3, 0, 'C-', '', 'MATH 213', 'LINEAR ALGEBRA'],
        ['MATH214', 'Calculus III', 'Required', 4, 0, 'C-', '', 'See available courses', ''],
        ['MATH261', 'Discrete Mathematics', 'Required', 3, 0, 'C-', '', 'See available courses', ''],
      ] },
    { name: 'Writing Intensive', needed: 6, earned: 6, prog: 0, met: true },
    { name: 'Physical Education', needed: 2, earned: 2, prog: 0, met: true },
  ];
  const TOTAL = { needed: 128, earned: 64, prog: 15 };

  // ---------- site map ----------
  const SCHEDULE_URL = '/ICS/Academics/Home.jnz?portlet=Student_Schedule';
  const DEGREE_URL = '/ICS/Academics/Home.jnz?portlet=My_Degree_Progress';
  const REG_URL = '/ICS/Academics/Home.jnz?portlet=AddDrop_Courses';
  const CHAPEL_URL = '/ICS/My_Info/Student.jnz?portlet=Universal_Portlet';
  const BALANCE_URL = '/ICS/Financial/Student_Accounts.jnz?portlet=CASHNet_My_Account_Info';
  const P = (title, href, text) => ({ title, href, text });
  const TABS = [
    { label: 'Home', href: '/ICS/', pages: [] },
    { label: 'Academics', href: '/ICS/Academics/', pages: [
      P('My Schedule', SCHEDULE_URL),
      P('Add/Drop Courses', REG_URL),
      P('Degree Progress', DEGREE_URL),
      P('Academic Calendar', '/ICS/Academics/Academic_Calendar.jnz', 'Classes begin in late August and mid January. Registration for next term opens in early November for seniors, then by class year. The last day to drop a class without a W on your transcript is the end of the sixth week. Final exams run the week after classes end. Reading day falls before finals.'),
      P('Transcript Requests', '/ICS/Academics/Transcripts.jnz', 'Request an official transcript from the Registrar. Electronic official transcripts are usually sent within two business days. An unofficial transcript is free and opens right away from this page. Holds on your account can delay a transcript.'),
      P('Tutoring Center', '/ICS/Academics/Tutoring.jnz', 'Free peer tutoring for most 100- and 200-level courses, Sunday to Thursday evenings in the library. Book a session online or walk in. Writing help is available for papers in any class.'),
      P('Study Abroad', '/ICS/Academics/Study_Abroad.jnz', 'Spend a semester or summer abroad. Meet with an advisor at least two terms ahead, choose an approved program, and have courses pre-approved so the credits transfer.'),
      P('Faculty Office Hours', '/ICS/Academics/Office_Hours.jnz', 'Office hours for every instructor this term. Stop by without an appointment during posted hours, or email to set up another time.'),
    ] },
    { label: 'My Info', href: '/ICS/My_Info/', pages: [
      P('Chapel Attendance', CHAPEL_URL),
      P('My Profile', '/ICS/My_Info/Profile.jnz', 'Your name, campus box, phone and mailing address. Update your preferred name and cell phone here; legal name changes go through the Registrar.'),
      P('Emergency Contacts', '/ICS/My_Info/Emergency_Contacts.jnz', 'Add or update the people to call in an emergency and sign up for campus text alerts. Review these every semester.'),
      P('Housing Assignment', '/ICS/My_Info/Housing.jnz', 'Your residence hall, room number and roommate for this term. Room selection for next year opens in the spring. Request maintenance from the facilities page.'),
    ] },
    { label: 'Campus Life', href: '/ICS/Campus_Life/', pages: [
      P('Dining Hours', '/ICS/Campus_Life/Dining.jnz', 'Both dining halls serve breakfast, lunch and dinner on weekdays. Weekend hours are shorter and one hall may be closed. Meal plan swipes reset each week; dining dollars carry over to the next term.'),
      P('Clubs and Organizations', '/ICS/Campus_Life/Clubs.jnz', 'Browse more than one hundred student organizations, from robotics to choir. The activities fair is the second week of fall. Starting a new club needs five members and a faculty sponsor.'),
      P('Intramural Sports', '/ICS/Campus_Life/Intramurals.jnz', 'Sign up a team or join as a free agent for flag football, volleyball, basketball and ultimate. Games are on weeknights; schedules post every Sunday.'),
      P('Campus Safety', '/ICS/Campus_Life/Safety.jnz', 'Campus Safety is open around the clock. Request a safety escort after dark, report a lost item, or register a bike. In an emergency call 911 first.'),
      P('Parking Permits', '/ICS/Campus_Life/Parking.jnz', 'Every car on campus needs a parking permit. Register your vehicle online and pick up the permit at Campus Safety. Commuter and resident lots are marked by color; tickets can be appealed within ten days.'),
      P('Events Calendar', '/ICS/Campus_Life/Events.jnz', 'Concerts, lectures, games and student events this month. Add any event to your calendar from its page.'),
    ] },
    { label: 'Financial', href: '/ICS/Financial/', pages: [
      P('Student Account', BALANCE_URL),
      P('Financial Aid Status', '/ICS/Financial/Aid_Status.jnz', 'See your financial aid awards and anything still needed, such as a signed form or verification documents. Accept or decline loans here.'),
      P('Payment Plans', '/ICS/Financial/Payment_Plans.jnz', 'Spread a semester bill over four or five monthly payments. Enroll before the first due date; there is a small enrollment fee.'),
      P('Student Employment', '/ICS/Financial/Employment.jnz', 'Find on-campus jobs and submit your timesheet every two weeks. New student workers must complete tax forms before their first shift.'),
    ] },
    { label: 'Resources', href: '/ICS/Resources/', pages: [
      P('IT Help Desk', '/ICS/Resources/IT_Help.jnz', 'Reset your password, connect to campus Wi-Fi, or get help with email and printing. Walk in or submit a ticket; most tickets are answered the same day.'),
      P('Library', '/ICS/Resources/Library.jnz', 'Search books and articles, reserve a study room, or ask a librarian for research help. Interlibrary loan requests usually arrive within a week.'),
      P('Career Services', '/ICS/Resources/Career_Services.jnz', 'Resume reviews, mock interviews and internship listings. The career fair is held each fall and spring.'),
      P('Health Center', '/ICS/Resources/Health_Center.jnz', 'Appointments for illness, injuries and immunizations. Bring your insurance card. After hours, call the nurse line.'),
      P('Counseling Services', '/ICS/Resources/Counseling.jnz', 'Free, confidential counseling for students. Schedule an appointment online; same-day crisis appointments are available.'),
    ] },
  ];
  const courseHref = (code) => {
    const [d, n, s] = code.split(' ');
    return `/ICS/Academics/${d}/${d}_${n}/${CUR.value.replace(';', '_')}-${d}_${n}-${s}/`;
  };

  // ---------- page shell (JICS-shaped: ids and classes the scripts look for) ----------
  function shell({ url, tab = 'Home', title, body, home = false, side }) {
    const tabs = TABS.map((t) => `<li class="tabs${t.label === tab ? ' selected' : ''}"><a href="${h(t.href)}">${h(t.label)}</a></li>`).join('');
    const ctx = side || (TABS.find((t) => t.label === tab) || TABS[0]).pages;
    const sideHTML = `
      <div class="side-section"><h2>${h(tab)}</h2><ul id="contextPages">${ctx.map((p) => `<li${p.href === url ? ' class="selected"' : ''}><a href="${h(p.href)}">${h(p.title)}</a></li>`).join('') || `<li class="selected"><a href="/ICS/">Home</a></li>`}</ul></div>
      <div class="side-section"><h2>My Courses</h2><ul id="quick-links-menu">${SCHEDULE.map((c) => `<li><a href="${h(courseHref(c.code))}">${h(c.code)} ${h(titleCase(c.title))}</a></li>`).join('')}</ul></div>`;
    return `<!doctype html><html><head><title>${h(title)}</title></head><body class="logged-in">
<form method="post" action="${h(url)}" id="MAINFORM">
<input type="hidden" name="__EVENTTARGET" value=""><input type="hidden" name="__EVENTARGUMENT" value=""><input type="hidden" name="__VIEWSTATE" value="demo">
<div id="sitemasthead">
  <div id="logo-heading"><a href="/ICS/" class="gccx-demo-logo">Sample Student Portal</a></div>
  <div id="welcomeBackBar">Welcome back <strong>${USER}</strong> <a href="/ICS/My_Info/Profile.jnz">My profile</a></div>
  <a class="gccx-demo-avatar" href="/ICS/My_Info/Profile.jnz" title="${USER} (sample)">DS</a>
</div>
<nav class="top-nav-bar"><ul id="main-nav">${tabs}</ul></nav>
<div id="mainLayout"><div class="container-fluid"><div class="row">
  <div id="sideBar">${sideHTML}</div>
  <div id="portlets">
    ${home ? '' : `<div id="PageBar_pageTitle" class="page-title"><h2>${h(title)}</h2></div>`}
    ${body}
  </div>
</div></div></div>
</form></body></html>`;
  }
  const portlet = (cls, title, inner, href) => `<div class="portlet ${cls}"><div class="portlet-header-bar"><h3>${href ? `<a href="${h(href)}">${h(title)}</a>` : h(title)}</h3></div><div class="pSection">${inner}</div></div>`;
  function titleCase(s) {
    return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(And|Of|The|In|To|For)\b/g, (w) => w.toLowerCase()).replace(/\bIi\b/g, 'II').replace(/\bIii\b/g, 'III').replace(/\bI\b/g, 'I');
  }
  const termSelect = (id, name, selected, autopost) => `<select id="${id}" name="${name}"${autopost ? ' data-autopostback' : ''}>${TERMS.map((t) => `<option value="${h(t.value)}"${t.value === selected ? ' selected' : ''}>${h(t.label)}</option>`).join('')}</select>`;

  // ---------- home: announcements and this week's events (relative to today, so the demo never goes stale) ----------
  const ANNOUNCEMENTS = [
    ['/ICS/Campus_Life/Events.jnz', 'Registration and planning are open', 'Posted ' + mdy(now) + ' by Registrar', 'Plan next term from Academics, Add/Drop Courses. Advisors have extra hours this week.'],
    ['/ICS/Campus_Life/Events.jnz', 'Library hours extended during finals', 'Posted ' + mdy(new Date(now.getTime() - DAY)) + ' by Library', 'The library stays open until 2 AM through finals week. Quiet floors are on levels 2 and 3.'],
    ['/ICS/Campus_Life/Events.jnz', 'Flu clinic on Thursday', 'Posted ' + mdy(new Date(now.getTime() - 2 * DAY)) + ' by Health Services', 'Free flu shots in the student union, no appointment needed.'],
    ['/ICS/Campus_Life/Events.jnz', 'Shuttle schedule changes', 'Posted ' + mdy(new Date(now.getTime() - 4 * DAY)) + ' by Campus Safety', 'Evening shuttles now run every 20 minutes until midnight.'],
  ];
  function eventsList() {
    const back = (now.getDay() + 6) % 7; // Monday of this week
    const day = (n) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - back + n);
    const EV = [ // [day offset from Monday, time text, title, location]
      [0, 'All Day', 'Fall food drive', 'Sample Student Union'],
      [0, '10:00 AM - 11:00 AM', 'Career center drop-in hours', 'Sample Career Center'],
      [1, '12:00 PM - 1:00 PM', 'Faculty lunch and learn', 'Sample Dining Hall'],
      [2, '7:00 PM - 9:00 PM', 'Student music and arts evening', 'Sample Arts Building'],
      [3, 'All Day', 'Flu clinic', 'Sample Student Union'],
      [3, '1:30 PM - 3:00 PM', 'Research and internship workshop', 'Sample Student Union'],
      [3, '2:00 PM - 4:00 PM', 'Open lab: robotics club', 'Sample Science Center'],
      [4, '6:00 PM', 'Movie night on the lawn', 'Sample Quad'],
      [5, '11:00 AM - 1:00 PM', 'Community service Saturday', 'Sample Chapel'],
    ];
    let out = '', last = -1;
    EV.forEach((e) => {
      if (e[0] !== last) { last = e[0]; out += `<div class="date">${h(day(e[0]).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</div>`; }
      out += `<div><span>${h(e[1])}</span><span><a href="/ICS/Campus_Life/Events.jnz">${h(e[2])}</a></span><div class="location">${h(e[3])}</div></div>`;
    });
    return `<div class="calendar-list-view">${out}</div>`;
  }

  // ---------- pages ----------
  function homePage(url) {
    const body = `<div id="portlet-grid">
      ${portlet('pi_Welcome', 'Welcome', '<p>Welcome to the sample student portal used by the aBetterMyGCC demo.</p>')}
      ${portlet('pi_Announcements', 'Campus Announcements', ANNOUNCEMENTS.map((a) => `<div class="post-item"><h4><a href="${h(a[0])}">${h(a[1])}</a></h4><div class="post-info">${h(a[2])}</div><div class="post-content"><p>${h(a[3])}</p></div></div>`).join(''))}
      ${portlet('pt_CalendarPortlet', 'Upcoming events', eventsList())}
      ${portlet('pi_Links', 'Need help?', '<p>Questions about this portal go to the IT Help Desk under Resources.</p><p><a href="/ICS/Campus_Life/Forums.jnz?portlet=Forums&amp;screen=Main">Try the sample forums</a></p>')}
    </div>`;
    return shell({ url, tab: 'Home', title: 'Home', body, home: true, side: [P('Home', '/ICS/')] });
  }

  function schedulePage(url, form) {
    const term = termOf(form.get('$ddlTerm') || CUR.value);
    const rows = term.value === CUR.value ? SCHEDULE : [];
    const meets = (c) => (c.meet.length > 1 ? `<ul>${c.meet.map((m) => `<li>${m[0]}<br>${m[1]} - ${m[2]}</li>`).join('')}</ul>` : c.meet.length ? `${c.meet[0][0]}<br>${c.meet[0][1]} - ${c.meet[0][2]}` : '');
    const rooms = (c) => (!c.meet.length ? 'MAIN / ONLNE /' : c.meet.length > 1 ? `<ul>${c.meet.map((m) => `<li>MAIN / ${m[3]} / ${m[4]}</li>`).join('')}</ul>` : `MAIN / ${c.meet[0][3]} / ${c.meet[0][4]}`);
    const table = `<table class="groupedGrid">
      <thead><tr><th>Course</th><th>Title</th><th>Course Instructors</th><th>Credits</th><th>Meets</th><th>Dates</th><th>Room</th><th>Status</th></tr></thead>
      <tbody>${rows.map((c, i) => `<tr>
        <td><a id="pg0_V_rptSchedule_ctl0${i}_lnkCourse" href="${h(courseHref(c.code))}">${h(c.code)}</a></td>
        <td>${h(c.title)}</td><td>${h(c.prof)}</td><td>${c.cr.toFixed(2)}</td>
        <td>${meets(c)}</td><td>${mdy(T_START)} - ${mdy(T_END)}</td><td>${rooms(c)}</td><td>Registered</td></tr>`).join('')}</tbody></table>`;
    const inner = `<div class="row"><div class="col-sm-2">Term</div><div class="col-sm-10">${termSelect('pg0_V_ddlTerm', 'pg0$V$ddlTerm', term.value, true)}</div></div>
      <h4>${h(term.label)}</h4>${rows.length ? table : '<p>No courses for this term.</p>'}`;
    return shell({ url, tab: 'Academics', title: 'My Schedule', body: portlet('pt_StudentSchedule', 'Student Schedule', inner, SCHEDULE_URL) });
  }

  function degreePage(url, form) {
    const target = form.get('__EVENTTARGET') || '';
    const m = /dgRequirementSummary\$ctl(\d+)\$lnkRequirement$/.exec(target);
    if (m && REQS[+m[1]] && REQS[+m[1]].rows) return degreeDetail(url, REQS[+m[1]]);
    const overview = `<table class="groupedGrid"><thead><tr><th>Name</th><th>Status</th></tr></thead><tbody>
      ${REQS.map((q) => `<tr><td>${h(q.name)}</td><td>${q.met ? 'Met' : 'Not Met'}</td></tr>`).join('')}</tbody></table>`;
    const summary = `<p>Overall GPA: 3.47 &nbsp; Credits Earned: ${TOTAL.earned}.00 &nbsp; Major: Computer Science (B.S.) &nbsp; Minor: Mathematics</p>
      <table id="pg0_V_dgRequirementSummary" class="groupedGrid">
      <tr><th>Requirement</th><th>Hours Needed</th><th>Hours Earned</th><th>In Progress</th><th>Status</th></tr>
      ${REQS.map((q, i) => `<tr><td>${q.met ? h(q.name) : `<a id="pg0_V_dgRequirementSummary_ctl${i}_lnkRequirement" href="javascript:__doPostBack('pg0$V$dgRequirementSummary$ctl${i}$lnkRequirement','')">${h(q.name)}</a>`}</td>
        <td>${q.needed}.00</td><td>${q.earned}.00</td><td>${q.prog}.00</td><td>${q.met ? 'Met' : 'Not Met'}</td></tr>`).join('')}
      <tr><td>Total Credits = ${TOTAL.needed}</td><td>${TOTAL.needed}.00</td><td>${TOTAL.earned}.00</td><td>${TOTAL.prog}.00</td><td>Not Met</td></tr></table>`;
    const body = portlet('pt_DegreeProgress', 'My Degree Progress', `<h4>Requirements overview</h4>${overview}<h4>Requirement summary</h4>${summary}`, DEGREE_URL);
    return shell({ url, tab: 'Academics', title: 'Degree Progress', body });
  }
  function degreeDetail(url, q) {
    const cats = `<table id="pg0_V_dgCategoryRequirements" class="groupedGrid"><tr><th>Requirement</th><th>Status</th><th>Needed</th><th>Earned</th></tr>
      ${q.cats.map(([n, met, need, earn]) => `<tr><td>${h(n)}</td><td>${met ? 'Met' : 'Not Met'}</td><td>${need}.00</td><td>${earn}.00</td></tr>`).join('')}</table>`;
    const rows = `<table class="groupedGrid"><tr><th>Req</th><th>Description</th><th>Status</th><th>Hours Needed</th><th>Hours Earned</th><th>Grade Needed</th><th>Earned</th><th>Course</th><th>Course Title</th></tr>
      ${q.rows.map((r) => `<tr>${r.map((v) => `<td>${h(v)}</td>`).join('')}</tr>`).join('')}</table>`;
    const back = `<a id="pg0_V_btnBack" href="javascript:__doPostBack('pg0$V$btnBack','')">Back to summary</a>`;
    return shell({ url, tab: 'Academics', title: 'Degree Progress', body: portlet('pt_DegreeProgress', 'My Degree Progress', `${back}<h4>${h(q.name)}</h4>${cats}${rows}`, DEGREE_URL) });
  }

  // ---------- Add/Drop ----------
  const fieldName = (sfx) => 'pg0$V$' + sfx;
  const fieldId = (sfx) => 'pg0_V_' + sfx.replace(/\$/g, '_');
  function searchForm(v) {
    const sel = (sfx, opts, val) => `<select id="${fieldId(sfx)}" name="${fieldName(sfx)}">${opts.map(([ov, ol]) => `<option value="${h(ov)}"${ov === val ? ' selected' : ''}>${h(ol)}</option>`).join('')}</select>`;
    const txt = (sfx, val) => `<input type="text" id="${fieldId(sfx)}" name="${fieldName(sfx)}" value="${h(val || '')}">`;
    const match = [['BeginsWith', 'Begins With'], ['Contains', 'Contains'], ['ExactMatch', 'Exact Match']];
    return `<div class="tabbox" data-demo-panel="search">
      <div class="row"><div class="col-sm-2">Course Code</div><div class="col-sm-3">${sel('tabSearch$ddlCourseRestrictor', match, v.codeMode || 'BeginsWith')}</div><div class="col-sm-7">${txt('tabSearch$txtCourseRestrictor', v.code)}</div></div>
      <div class="row"><div class="col-sm-2">Course Title</div><div class="col-sm-3">${sel('tabSearch$ddlTitleRestrictor', match, v.titleMode || 'Contains')}</div><div class="col-sm-7">${txt('tabSearch$txtTitleRestrictor', v.title)}</div></div>
      <div class="row"><div class="col-sm-1">Term</div><div class="col-sm-11">${termSelect(fieldId('tabSearch$ddlTermSearch'), fieldName('tabSearch$ddlTermSearch'), v.term)}</div></div>
      <div class="row"><div class="col-sm-1">Department</div><div class="col-sm-11">${sel('tabSearch$ddlDept', [['', 'All departments'], ...DEPTS.map((d) => [d, d])], v.dept || '')}</div></div>
      <div class="row"><div class="col-xs-12"><input type="submit" class="btn btn-primary" id="${fieldId('tabSearch$btnSearch')}" name="${fieldName('tabSearch$btnSearch')}" value="Search"></div></div>
    </div>`;
  }
  function refForm(hidden) {
    const boxes = [1, 2, 3, 4, 5, 6].map((n) => `<div class="col-sm-6">${n} <input type="text" id="${fieldId('tabRef$tbRefNum' + n)}" name="${fieldName('tabRef$tbRefNum' + n)}" value="" maxlength="6"></div>`);
    return `<div class="tabbox" data-demo-panel="ref"${hidden ? ' hidden' : ''}>
      <div class="row"><div class="col-xs-12">Enter up to six course reference numbers, then press Add Course(s). In this demo nothing is registered.</div></div>
      <div class="row">${boxes[0]}${boxes[1]}</div><div class="row">${boxes[2]}${boxes[3]}</div><div class="row">${boxes[4]}${boxes[5]}</div>
      <div class="row"><div class="col-xs-12"><input type="submit" class="btn btn-primary" id="${fieldId('tabRef$gbtnSearchRef')}" name="${fieldName('tabRef$gbtnSearchRef')}" value="Add Course(s)"></div></div>
    </div>`;
  }
  const tabsHTML = (inner) => `<div class="contentTabs"><ul><li class="selected"><a href="#" data-demo-tab="search">Course Search</a></li><li><a href="#" data-demo-tab="ref">Add by Reference #</a></li></ul>${inner}</div>`;
  // ['TR', '11:00', '12:15 PM'] -> "TR 11:00 AM-12:15 PM"
  function meetText(m) {
    const endMer = m[2].slice(-2);
    const sh = +m[1].split(':')[0] % 12, eh = +m[2].split(':')[0] % 12;
    const startMer = endMer === 'PM' && sh > eh ? 'AM' : endMer;
    return `${m[0]} ${m[1]} ${startMer}-${m[2]}`;
  }
  const notice = (msg) => (msg ? `<div class="feedbackMessage" role="status"><p>${h(msg)}</p></div>` : '');
  const registeredFor = (term) => (term.value === CUR.value
    ? SCHEDULE.map((c) => ({ code: c.code, title: c.title, cr: c.cr, sched: c.meet.length ? c.meet.map(meetText).join(', ') + `; Main Campus, ${BLD[c.meet[0][3]]}, ${c.meet[0][4]}` : 'Online' }))
    : term.value === NEXT.value ? CATALOG.filter((c) => NEXT_REGISTERED.includes(c.code)).map((c) => ({ code: c.code, title: c.title, cr: c.cr, sched: schedText(c) })) : []);

  function addDropMain(url, termValue, msg) {
    const term = termOf(termValue);
    const reg = registeredFor(term);
    const open = term.value === NEXT.value;
    const yours = `<h4>Your Schedule for ${h(term.label)}</h4>${reg.length ? `<table class="groupedGrid"><thead><tr><th>Drop</th><th>Course</th><th>Title</th><th>Schedule</th><th>Credits</th></tr></thead><tbody>
      ${reg.map((c, i) => `<tr><td><input type="checkbox" id="pg0_V_rptConfCourses_ctl0${i}_chkDrop" disabled title="Dropping is turned off in the demo"></td><td>${h(c.code)}</td><td>${h(c.title)}</td><td>${h(c.sched)}</td><td>${c.cr.toFixed(2)}</td></tr>`).join('')}
      </tbody></table>` : '<p>You are not registered for any courses in this term.</p>'}`;
    const inner = `${notice(msg)}
      <div class="row"><div class="col-sm-2">Term</div><div class="col-sm-10">${termSelect('pg0_V_ddlTerm', 'pg0$V$ddlTerm', term.value, true)}</div></div>
      <p class="hint">${open ? 'Add Period Open. You may add and drop courses for this term.' : 'The add/drop period for this term is closed.'}</p>
      ${yours}
      ${tabsHTML(searchForm({ term: NEXT.value }) + refForm(true))}`;
    return shell({ url, tab: 'Academics', title: 'Add/Drop Courses', body: portlet('pt_CourseSchedules', 'Add/Drop Courses', inner, REG_URL) });
  }

  function search(v) {
    const code = (v.code || '').trim().toUpperCase().replace(/\s+/g, ' ');
    const title = (v.title || '').trim().toUpperCase();
    return CATALOG.filter((c) => {
      if (v.dept && !c.code.startsWith(v.dept + ' ')) return false;
      if (code) {
        if (v.codeMode === 'ExactMatch' ? c.code !== code : v.codeMode === 'Contains' ? !c.code.includes(code) : !c.code.startsWith(code)) return false;
      }
      if (title) {
        if (v.titleMode === 'BeginsWith' ? !c.title.startsWith(title) : !c.title.includes(title)) return false;
      }
      return true;
    });
  }
  function addDropResults(url, v) {
    const found = search(v);
    const term = termOf(v.term);
    const rows = found.map((c) => {
      const id = c.code.replace(/\s+/g, '_');
      return `<tr><td></td>
        <td><a id="pg0_V_dgCourses_s_${id}_lnkCourse" href="javascript:__doPostBack('pg0$V$dgCourses$s_${id}$lnkCourse','')">${h(c.code)}</a></td>
        <td>${h(c.title)}</td><td>${h(c.prof)}</td><td>${c.open}/${c.cap}</td><td>${c.open ? 'Open' : 'Full'}</td><td>${h(schedText(c))}</td><td>${c.cr.toFixed(2)}</td></tr>
        <tr class="subItem"><td></td><td colspan="7">Textbooks: see the campus store (sample)</td></tr>`;
    }).join('');
    const inner = `<input type="hidden" name="pg0$V$hdnTerm" value="${h(term.value)}">
      ${tabsHTML(searchForm(v) + refForm(true))}
      <h4>${found.length} section${found.length === 1 ? '' : 's'} found in ${h(term.label)}</h4>
      ${found.length ? `<table id="pg0_V_dgCourses" class="groupedGrid"><tr><th>Add</th><th>Course Code</th><th>Name</th><th>Faculty</th><th>Seats Open</th><th>Status</th><th>Schedule</th><th>Credits</th></tr>${rows}</table>`
        : '<p>No sections match. Try a department code such as COMP, MATH, HUMA, SPAN or STAT.</p>'}`;
    return shell({ url, tab: 'Academics', title: 'Add/Drop Courses', body: portlet('pt_CourseSchedules', 'Add/Drop Courses', inner, REG_URL) });
  }
  function addDropDetails(url, code, termValue) {
    const c = CATALOG.find((x) => x.code === code);
    if (!c) return addDropMain(url, termValue, 'That section was not found.');
    const term = termOf(termValue);
    const back = `<a id="pg0_V_lnkBack" href="javascript:__doPostBack('pg0$V$lnkBack','')">Back to Add/Drop</a>`;
    const inner = `<input type="hidden" name="pg0$V$hdnTerm" value="${h(term.value)}">${back}
      <div class="row" hidden><div class="col-sm-1">Term</div><div class="col-sm-11">${termSelect(fieldId('tabSearch$ddlTermSearch'), fieldName('tabSearch$ddlTermSearch'), term.value)}</div></div>
      <h4>${h(c.title)} (${h(c.code)})</h4>
      <div>${h(term.label)}, ${mdy(new Date(T_END.getTime() + 40 * DAY))} - ${mdy(new Date(T_END.getTime() + 150 * DAY))}</div>
      <div>${c.cr.toFixed(2)} Credits</div>
      <div>Instructor(s): ${h(c.prof)}</div>
      <div>Reference number: <span id="pg0_V_lblReferenceNumberValue">${c.ref}</span></div>
      <div>Seats: (${c.open} out of ${c.cap} seats)</div>
      ${c.sched.length ? `<table class="groupedGrid"><tr><th>Days</th><th>Time</th><th>Location</th></tr>${c.sched.map(([d, t]) => `<tr><td>${d}</td><td>${h(t.replace('-', ' - '))}</td><td>${h(BLD[c.bld])} ${h(c.room)}</td></tr>`).join('')}</table>` : '<p>Online, no set meeting time.</p>'}
      <p>Course description (sample): an overview of ${h(titleCase(c.title).toLowerCase())}, with weekly readings, problem sets and a final project.</p>
      <p><a id="pg0_V_lnkAddCourse" href="javascript:__doPostBack('pg0$V$lnkAddCourse','')">Add this course</a></p>`;
    return shell({ url, tab: 'Academics', title: 'Add/Drop Courses', body: portlet('pt_CourseSchedules', 'Add/Drop Courses', inner, REG_URL) });
  }
  const DEMO_NOTE = 'Demo mode: nothing was registered. On the real myGCC this would add the course to your schedule.';
  function addDropPage(url, form) {
    const target = form.get('__EVENTTARGET') || '';
    const has = (sfx) => [...form.keys()].some((k) => k.endsWith(sfx));
    const termNow = form.get('$hdnTerm') || form.get('$tabSearch$ddlTermSearch') || NEXT.value;
    if (has('$tabSearch$btnSearch')) {
      return addDropResults(url, {
        term: form.get('$tabSearch$ddlTermSearch') || NEXT.value,
        code: form.get('$tabSearch$txtCourseRestrictor'), codeMode: form.get('$tabSearch$ddlCourseRestrictor'),
        title: form.get('$tabSearch$txtTitleRestrictor'), titleMode: form.get('$tabSearch$ddlTitleRestrictor'),
        dept: form.get('$tabSearch$ddlDept'),
      });
    }
    if (has('$tabRef$gbtnSearchRef')) return addDropMain(url, form.get('$ddlTerm') || NEXT.value, DEMO_NOTE);
    let m;
    if ((m = /\$s_([A-Z0-9_]+)\$lnkCourse$/.exec(target))) return addDropDetails(url, m[1].replace(/_/g, ' '), termNow);
    if (/lnkAddCourse$/.test(target)) return addDropMain(url, termNow, DEMO_NOTE);
    if (/\$ddlTerm$/.test(target)) return addDropMain(url, form.get('$ddlTerm'));
    if (/lnkBack$/.test(target)) return addDropMain(url, CUR.value);
    return addDropMain(url, CUR.value);
  }

  function chapelPage(url) {
    const body = portlet('pi_Universal_Portlet', 'Chapel Attendance', `<p>Attendance for this term. Credits can take a day to appear.</p>
      <iframe src="/demo/chapel.html" title="Chapel attendance" style="width:100%;height:190px;border:0"></iframe>`, CHAPEL_URL);
    return shell({ url, tab: 'My Info', title: 'Chapel Attendance', body });
  }
  function balancePage(url) {
    const body = portlet('pi_CASHNet', 'Student Account', `<p>Balances as of ${mdy(now)}:</p>
      <table class="groupedGrid"><tr><td>Accounts Receivable</td> <td>$245.00</td> <td>Credit</td></tr></table>
      <p>Make a payment or view statements from the account center (not available in the demo).</p>`, BALANCE_URL);
    return shell({ url, tab: 'Financial', title: 'Student Account', body });
  }
  function textPage(url, tab, p) {
    return shell({ url, tab: tab.label, title: p.title, body: portlet('pi_Free_form_Content', p.title, `<div class="wysiwygtext"><p>${h(p.text)}</p></div>`) });
  }
  // My Info landing page: two portlet columns like the live tab (the dashboard draws above #portlet-grid;
  // myinfo.js merges the residence/vehicle/directory cards by these ids).
  function myInfoPage(url) {
    const card = (id, cls, title, inner) => `<div id="${id}" class="portlet ${cls}"><div class="portlet-header-bar"><h3>${h(title)}</h3></div><div class="portlet-padding"><div class="pSection">${inner}</div></div></div>`;
    const body = `<div id="portlet-grid" class="portlet-grid two_column_even"><div class="row">
      <div class="portlet-column col-md-6">
        ${card('pg0_Universal_Portlet', 'pi_Universal_Portlet', 'Chapel Attendance', `<p>Your chapel credits for this term. <a href="${h(CHAPEL_URL)}">Open chapel attendance</a></p>`)}
        ${card('pg1_Profile', 'pi_Free_form_Content', 'My Profile', '<p><a href="/ICS/My_Info/Profile.jnz">Update your preferred name and cell phone</a></p>')}
      </div>
      <div class="portlet-column col-md-6">
        ${card('pg6_ResidenceInfo', 'pi_ResidenceInfo', 'My Residence Information', '<a href="/ICS/My_Info/Housing.jnz">Housing assignment</a>')}
        ${card('pg7_VehicleInfo', 'pi_VehicleInfo', 'My Vehicle Information', '<a href="/ICS/My_Info/Profile.jnz">Register a vehicle</a>')}
        ${card('pg8_PDFReports', 'pi_PDFReports', 'Directories', '<a href="/ICS/My_Info/Profile.jnz">Student directory</a> <a href="/ICS/My_Info/Profile.jnz">Faculty and staff directory</a>')}
      </div>
    </div></div>`;
    return shell({ url, tab: 'My Info', title: 'My Info', body });
  }
  function tabPage(url, tab) {
    const list = tab.pages.map((p) => `<li><a href="${h(p.href)}">${h(p.title)}</a></li>`).join('');
    return shell({ url, tab: tab.label, title: tab.label, body: portlet('pi_Free_form_Content', `${tab.label} pages`, `<ul>${list}</ul>`) });
  }
  function coursePage(url, c) {
    const body = portlet('pi_Course_Home', `${c.code} ${titleCase(c.title)}`, `<div class="wysiwygtext">
      <p>Course home for ${h(c.code)} ${h(titleCase(c.title))} with ${h(c.prof)}.</p>
      <p>Announcements (sample): the next problem set is due Friday; office hours move to Thursday this week. The syllabus and grades are in the course's learning site.</p></div>`);
    return shell({ url, tab: 'Academics', title: `${c.code} ${titleCase(c.title)}`, body });
  }
  // Representative forum markup for release QA; all posts and people are fictional.
  const FORUM_URL = '/ICS/Campus_Life/Forums.jnz?portlet=Forums';
  function forumPage(url, screen) {
    const link = (view) => h(FORUM_URL + '&screen=' + view);
    const cell = (label, value) => `<div role="cell" class="forum-grid-column"><span class="forum-grid-header-label">${label}</span><div class="mobile-column-value">${value}</div></div>`;
    const topics = ['Campus questions', 'Study groups'];
    const rows = topics.map((name, i) => `<div role="row">
      <div role="cell" class="forum-grid-column"><div class="topic-link-container"><a href="${link('TopicView')}">${name}</a><p>Fictional demo discussion for students.</p></div></div>
      ${cell('Unread', i ? '0' : `<a href="${link('PostView')}">2</a>`)}${cell('Posts', '3')}${cell('Replies', '2')}
      ${cell('Latest', `<div class="post-link"><a href="${link('PostView')}">Welcome to the demo forum</a></div><div class="post-attribution">by Demo Student<br>on ${mdy(now)} at 10:00 AM</div>`)}
    </div>`).join('');
    const postRows = topics.map((name, i) => `<div role="row">${cell('Post', `<div class="post-link"><a href="${link('PostView')}">${i ? 'Finding a study group' : 'Welcome to the demo forum'}</a></div><div class="post-attribution">by Demo Student<br>on ${mdy(now)} at 10:00 AM</div>`)}${cell('Unread', '1')}${cell('Replies', '2')}${cell('Latest', `<div class="post-link"><a href="${link('PostView')}">Read reply</a></div>`)}</div>`).join('');
    let inner;
    if (screen === 'topicview') inner = `<div class="category-label">Student discussions</div><div class="topic-link-title"><h3>Campus questions</h3></div><div class="topic-options"><a class="add-post-link btn-primary" href="${link('AddPost')}">New post</a></div><div class="forum-grid" role="table">${postRows}</div>`;
    else if (screen === 'postview') inner = `<div class="category-label">Student discussions</div><div class="post-view-header"><h3 class="post-title">Welcome to the demo forum</h3></div><div class="post-view-container"><div class="post"><div class="post-attribution">by Demo Student</div><div class="post-content"><p>This fictional post lets you try reading a forum without a college login.</p></div><a class="post-reply-btn btn-primary" href="${link('AddPost')}">Reply</a></div></div>`;
    else if (screen === 'addpost') inner = `<div class="add-post"><h3 class="manage-title">New post</h3><div class="manage-post-container"><label for="demo-post-title">Title</label><input id="demo-post-title" type="text"><label for="demo-post-body">Message</label><textarea id="demo-post-body" rows="6"></textarea><p>Demo only: messages are not saved or sent.</p><a href="${link('TopicView')}">Back to posts</a></div></div>`;
    else inner = `<div class="main-content"><h4 class="forum-grid-name">Student discussions</h4><div class="forum-grid" role="table">${rows}</div></div>`;
    return shell({ url, tab: 'Campus Life', title: 'Forums (sample)', body: portlet('pt_ForumPortlet', 'Forums', `<div class="forums-portlet"><a class="topic-navigation-main-screen-link" href="${link('Main')}">All forums</a>${inner}</div>`, FORUM_URL + '&screen=Main') });
  }
  function notFound(url) {
    return shell({ url, tab: 'Home', title: 'Not in the demo', body: portlet('pi_Free_form_Content', 'Not in the demo', '<p>This page is not part of the sample portal. Use the tabs above or press Ctrl K to search.</p>') });
  }

  // ---------- router ----------
  function handle(method, url, body) {
    const u = new URL(url, 'https://demo.invalid');
    const path = u.pathname.replace(/\/+$/, '') || '/';
    const portletName = (u.searchParams.get('portlet') || '').toLowerCase();
    const raw = new URLSearchParams(method === 'POST' ? body || '' : '');
    // look up form fields by name suffix, the way ASP.NET control names nest
    const form = { get: (k) => { if (raw.has(k)) return raw.get(k); for (const [n, v] of raw) if (n.endsWith(k)) return v; return null; }, keys: () => raw.keys() };
    const full = u.pathname + u.search;
    const p = path.toLowerCase();
    // the portal's iCal export (/ICS/api/ical/<id>): two sample events this week, one repeating, in calendar format
    if (/^\/ics\/api\/ical\//.test(p)) {
      const d = new Date(); const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
      const stamp = (x, hh, mm) => `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, '0')}${String(x.getDate()).padStart(2, '0')}T${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}00`;
      const tue = new Date(mon); tue.setDate(mon.getDate() + 1);
      return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jenzabar//JICS Calendar//EN',
        'BEGIN:VEVENT', `DTSTART:${stamp(tue, 17, 0)}`, `DTEND:${stamp(tue, 18, 30)}`, 'SUMMARY:Sample feed event: Career fair prep', 'LOCATION:Sample Student Union', 'END:VEVENT',
        'BEGIN:VEVENT', `DTSTART:${stamp(mon, 8, 0)}`, `DTEND:${stamp(mon, 8, 50)}`, 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=30', 'SUMMARY:Class Session (DATA STRUCTURES (COMP 205 A))', 'LOCATION:STEM 120', 'END:VEVENT',
        'END:VCALENDAR'].join(String.fromCharCode(13, 10));
    }
    if (p === '/ics/campus_life/forums.jnz') return forumPage(full, (u.searchParams.get('screen') || 'Main').toLowerCase());
    if (p === '/ics' || p === '/ics/portal_homepage.jnz' || p === '/ics/default.aspx') return homePage(full);
    if (p === '/ics/academics/home.jnz') {
      if (portletName === 'student_schedule') return schedulePage(full, form);
      if (portletName === 'my_degree_progress') return degreePage(full, form);
      if (portletName === 'adddrop_courses') return addDropPage(full, form);
      return tabPage(full, TABS[1]);
    }
    if (p === '/ics/my_info/student.jnz') return chapelPage(full);
    if (p === '/ics/my_info' || p === '/ics/my_info/default_page.jnz') return myInfoPage(full);
    if (p === '/ics/financial/student_accounts.jnz') return balancePage(full);
    for (const tab of TABS) {
      if (tab.href.replace(/\/+$/, '').toLowerCase() === p) return tabPage(full, tab);
      const page = tab.pages.find((x) => x.text && x.href.toLowerCase() === p);
      if (page) return textPage(full, tab, page);
    }
    const course = SCHEDULE.find((c) => courseHref(c.code).replace(/\/+$/, '').toLowerCase() === p);
    if (course) return coursePage(full, course);
    return notFound(full);
  }

  // Sample dining menu for the dashboard (the real one comes from the dining service).
  function menu(hall) {
    const hr = new Date().getHours();
    const meal = hr < 10 ? ['Breakfast', '10:00 AM'] : hr < 16 ? ['Lunch', '4:00 PM'] : hr < 20 ? ['Dinner', '8:00 PM'] : ['Breakfast at 7:00 AM', null];
    const H = {
      'hicks-cafe': [['Grill', ['Turkey burger', 'Veggie burger', 'Sweet potato fries']], ['Home Style', ['Lemon herb chicken', 'Roasted carrots', 'Rice pilaf']], ['Pizza', ['Margherita', 'Pepperoni', 'Garlic knots']], ['Salad Bar', ['Spinach and greens', 'Chickpea salad', 'Fresh fruit']]],
      'map-cafe': [['Deli', ['Build-your-own sandwich', 'Tomato basil soup']], ['World Kitchen', ['Chicken teriyaki bowl', 'Vegetable stir fry', 'Jasmine rice']], ['Bakery', ['Oatmeal cookies', 'Banana bread']]],
    };
    return { meal: meal[0], until: meal[1], stations: (H[hall] || H['hicks-cafe']).map(([name, items]) => ({ name, items })) };
  }

  // Already-registered classes for next term, in the shape builder.js stores after visiting Add/Drop.
  function nextRegistered() {
    return { term: NEXT.value, courses: CATALOG.filter((c) => NEXT_REGISTERED.includes(c.code)).map((c) => ({ code: c.code, schedule: schedText(c), credits: c.cr })) };
  }

  window.GCCX_DEMO_SERVER = { handle, menu, nextRegistered, USER, TERMS: { CUR, NEXT } };
})();
