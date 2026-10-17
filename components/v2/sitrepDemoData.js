const now = Date.now();
const minsAgo = (m) => new Date(now - m * 60 * 1000).toISOString();

export const DEFAULT_WIDGET_LAYOUT = [
  { id: "kpi_residents", title: "תושבים שצריכים מענה", colSpan: 4, rowSpan: "compact", hidden: false },
  { id: "kpi_tasks", title: "משימות פתוחות", colSpan: 4, rowSpan: "compact", hidden: false },
  { id: "kpi_events", title: "אירועים ביומן", colSpan: 4, rowSpan: "compact", hidden: false },
  { id: "status_bar", title: "מד סטטוס תושבים (% לפי צבעים)", colSpan: 6, rowSpan: "normal", hidden: false },
  { id: "public_announcement", title: "הודעה אחרונה לציבור", colSpan: 6, rowSpan: "normal", hidden: false },
  { id: "dept_heads", title: "כח אדם — ראשי מחלקות ומכלולים", colSpan: 6, rowSpan: "normal", hidden: false },
  { id: "event_summary", title: "סיכום יומן אירועים — מה קרה ואיפה עומדים", colSpan: 6, rowSpan: "normal", hidden: false },
  { id: "green_eyes_table", title: "טבלת ירוק בעיניים — פילוח לפי שכונה ותושבים", colSpan: 8, rowSpan: "tall", hidden: false },
  { id: "dept_tasks", title: "סיכום משימות לפי מכלול", colSpan: 4, rowSpan: "tall", hidden: false },
  { id: "timeline", title: "ציר זמן חי", colSpan: 12, rowSpan: "normal", hidden: false },
];

export const WIDTH_PRESETS = [
  { label: "1/4", cols: 3 },
  { label: "1/3", cols: 4 },
  { label: "1/2", cols: 6 },
  { label: "2/3", cols: 8 },
  { label: "מלא", cols: 12 },
];

export const HEIGHT_PRESETS = [
  { key: "compact", label: "קומפקטי" },
  { key: "normal", label: "רגיל" },
  { key: "tall", label: "גבוה" },
];

export const DEFAULT_DEPT_HEADS = [
  { dept: 'חמ"ל', headName: "אדם רוזנברג", phone: "054-4912201", status: 'בחמ"ל', activeCount: 5 },
  { dept: "רפואה", headName: 'ד"ר יעל שפירא', phone: "052-8331940", status: "בשטח", activeCount: 4 },
  { dept: "אוכלוסיה", headName: "מיכל אברהמי", phone: "050-6774120", status: 'בחמ"ל', activeCount: 7 },
  { dept: "לוגיסטיקה", headName: "רונן כץ", phone: "054-2289103", status: "בשטח", activeCount: 6 },
  { dept: "חוסן", headName: "נועה פרידמן", phone: "053-7128890", status: "זמין", activeCount: 3 },
  { dept: "אחר", headName: "גיא לוי (כיתת כוננות)", phone: "050-9114402", status: "בשטח", activeCount: 8 },
];

export const DEFAULT_ANNOUNCEMENTS = [
  {
    id: "ann-1",
    timestamp: minsAgo(14),
    author: 'חמ"ל יישובי',
    text: "תושבים יקרים, בעקבות הפסקת החשמל בשכונת ההרחבה ונפילת הרסיסים באזור המרכז, צוותי הצח״י והרפואה פרוסים בשטח. יש להמשיך לשהות בקרבת מרחבים מוגנים, לעדכן סטטוס בטופס 'ירוק בעיניים' ולדווח לחמ״ל על כל צורך רפואי או לוגיסטי.",
  },
  {
    id: "ann-2",
    timestamp: minsAgo(48),
    author: "ראש צח״י",
    text: "הופעל נוהל 'ירוק בעיניים' ביישוב. אנא היכנסו לקישור שנשלח בוואטסאפ השכונתי וסמנו את מצב משפחתכם. מוקד החמ״ל מאויש.",
  },
];

export const DEMO_RESIDENTS = [
  { id: "r1", "שם פרטי": "דנה", "שם משפחה": "כהן", שכונה: "ההרחבה הצפונית", סטטוס: "זקוקים לסיוע", טלפון: "050-2345671", "מספר בית": "12", הערות: "קשישה, זקוקה לגנרטור למחולל חמצן", statusHistory: [{ from: "ללא סטטוס", to: "זקוקים לסיוע", timestamp: minsAgo(38) }] },
  { id: "r2", "שם פרטי": "יוסי", "שם משפחה": "לוי", שכונה: "ההרחבה הצפונית", סטטוס: "כולם בסדר", טלפון: "052-3456782", "מספר בית": "14", הערות: "", statusHistory: [{ from: "ללא סטטוס", to: "כולם בסדר", timestamp: minsAgo(42) }] },
  { id: "r3", "שם פרטי": "אורי", "שם משפחה": "מזרחי", שכונה: "ההרחבה הצפונית", סטטוס: "פצוע", טלפון: "054-4567893", "מספר בית": "19", הערות: "פציעה קלה מרסיסי זכוכית, צוות רפואה בדרך", statusHistory: [{ from: "לא בטוח", to: "פצוע", timestamp: minsAgo(25) }] },
  { id: "r4", "שם פרטי": "רונית", "שם משפחה": "ברק", שכונה: "ההרחבה הצפונית", סטטוס: "כולם בסדר", טלפון: "053-5678904", "מספר בית": "22", הערות: "משפחה עם 3 ילדים" },
  { id: "r5", "שם פרטי": "שמעון", "שם משפחה": "חדד", שכונה: "ההרחבה הצפונית", סטטוס: "לא בטוח", טלפון: "050-6789015", "מספר בית": "27", הערות: "נותק הקשר לאחר הפסקת החשמל" },
  { id: "r6", "שם פרטי": "גלית", "שם משפחה": "שלום", שכונה: "ההרחבה הצפונית", סטטוס: "כולם בסדר", טלפון: "052-7890126", "מספר בית": "30", הערות: "" },
  { id: "r7", "שם פרטי": "אבי", "שם משפחה": "פרץ", שכונה: "מרכז היישוב", סטטוס: "כולם בסדר", טלפון: "054-8901237", "מספר בית": "4", הערות: "" },
  { id: "r8", "שם פרטי": "מרים", "שם משפחה": "אלוני", שכונה: "מרכז היישוב", סטטוס: "זקוקים לסיוע", טלפון: "050-9012348", "מספר בית": "8", הערות: "מתניידת בכיסא גלגלים, דלת ממ״ד תקועה", statusHistory: [{ from: "ללא סטטוס", to: "זקוקים לסיוע", timestamp: minsAgo(31) }] },
  { id: "r9", "שם פרטי": "נדב", "שם משפחה": "קליין", שכונה: "מרכז היישוב", סטטוס: "כולם בסדר", טלפון: "052-1122334", "מספר בית": "11", הערות: "" },
  { id: "r10", "שם פרטי": "שירה", "שם משפחה": "גولן", שכונה: "מרכז היישוב", סטטוס: "כולם בסדר", טלפון: "054-2233445", "מספר בית": "15", הערות: "רופאה מתנדבת" },
  { id: "r11", "שם פרטי": "חיים", "שם משפחה": "ביטון", שכונה: "מרכז היישוב", סטטוס: "ללא סטטוס", טלפון: "050-3344556", "מספר בית": "18", הערות: "גר בגפו — נדרש ביקור בית" },
  { id: "r12", "שם פרטי": "תמר", "שם משפחה": "זיו", שכונה: "שכונת הכרמים", סטטוס: "כולם בסדר", טלפון: "053-4455667", "מספר בית": "3", הערות: "" },
  { id: "r13", "שם פרטי": "עומר", "שם משפחה": "דגן", שכונה: "שכונת הכרמים", סטטוס: "כולם בסדר", טלפון: "052-5566778", "מספר בית": "7", הערות: "" },
  { id: "r14", "שם פרטי": "ליאת", "שם משפחה": "סגל", שכונה: "שכונת הכרמים", סטטוס: "זקוקים לסיוע", טלפון: "054-6677889", "מספר בית": "9", הערות: "ילדים בחרדה, מבקשת שיחה עם צוות חוסן", statusHistory: [{ from: "כולם בסדר", to: "זקוקים לסיוע", timestamp: minsAgo(19) }] },
  { id: "r15", "שם פרטי": "בועז", "שם משפחה": "נחמיאס", שכונה: "שכונת הכרמים", סטטוס: "כולם בסדר", טלפון: "050-7788990", "מספר בית": "16", הערות: "" },
  { id: "r16", "שם פרטי": "קרן", "שם משפחה": "אשכנזי", שכונה: "שכונת הכרמים", סטטוס: "לא בטוח", טלפון: "052-8899001", "מספר בית": "21", הערות: "דיווח ראשוני חלקי" },
  { id: "r17", "שם פרטי": "אلي", "שם משפחה": "מלכה", שכונה: "גבעת האורנים", סטטוס: "כולם בסדר", טלפון: "054-9900112", "מספר בית": "2", הערות: "" },
  { id: "r18", "שם פרטי": "נעמי", "שם משפחה": "רובין", שכונה: "גבעת האורנים", סטטוס: "כולם בסדר", טלפון: "050-1011121", "מספר בית": "5", הערות: "" },
  { id: "r19", "שם פרטי": "יגאל", "שם משפחה": "שטרן", שכונה: "גבעת האורנים", סטטוס: "ללא סטטוס", טלפון: "052-1213141", "מספר בית": "10", הערות: "טרם ענה להודעת וואטסאפ" },
  { id: "r20", "שם פרטי": "ענת", "שם משפחה": "טל", שכונה: "גבעת האורנים", סטטוס: "כולם בסדר", טלפון: "053-1415161", "מספר בית": "13", הערות: "" },
];

export const DEMO_TASKS = [
  { id: "t1", title: "טיפול רפואי דחוף בבית משפחת מזרחי (בית 19)", category: "רפואה", department: "רפואה", priority: "דחוף", status: "בטיפול", done: false, residentId: "r3", createdAt: minsAgo(24), replies: [{ timestamp: minsAgo(21), text: "חובש הגיע למקום, פציעה קלה מרסיסים" }] },
  { id: "t2", title: "אספקת גנרטור חירום למחולל חמצן — דנה כהן (בית 12)", category: "לוגיסטיקה", department: "לוגיסטיקה", priority: "דחוף", status: "בטיפול", done: false, residentId: "r1", createdAt: minsAgo(35), replies: [{ timestamp: minsAgo(28), text: "גנרטור הועמס על רכב לוגיסטיקה" }] },
  { id: "t3", title: "חילוץ/פתיחת דלת ממ״ד תקועה — מרים אלוני (בית 8)", category: "לוגיסטיקה", department: "לוגיסטיקה", priority: "דחוף", status: "הושלם", done: true, residentId: "r8", createdAt: minsAgo(30), completedAt: minsAgo(16), replies: [{ timestamp: minsAgo(25), text: "צוות תחזוקה יצא" }] },
  { id: "t4", title: "סבב ביקורי בית למנותקי קשר בהרחבה הצפונית (בתים 18, 27)", category: "אוכלוסיה", department: "אוכלוסיה", priority: "רגיל", status: "בטיפול", done: false, createdAt: minsAgo(22), replies: [{ timestamp: minsAgo(18), text: "רכזת שכונה יצאה לסבב" }] },
  { id: "t5", title: "תמיכה רגשית למשפחת סגל (שכונת הכרמים 9)", category: "חוסן", department: "חוסן", priority: "רגיל", status: "מחכה", done: false, residentId: "r14", createdAt: minsAgo(17), replies: [] },
  { id: "t6", title: "פתיחת חמ״ל ובדיקת קשר מול פיקוד העורף ומועצה", category: 'חמ"ל', department: 'חמ"ל', priority: "דחוף", status: "הושלם", done: true, createdAt: minsAgo(52), completedAt: minsAgo(45), replies: [{ timestamp: minsAgo(49), text: "קשר תקין" }] },
  { id: "t7", title: "הצבת תאורת חירום בצומת ההרחבה הצפונית", category: "לוגיסטיקה", department: "לוגיסטיקה", priority: "רגיל", status: "הושלם", done: true, createdAt: minsAgo(40), completedAt: minsAgo(20), replies: [{ timestamp: minsAgo(35), text: "בביצוע" }] },
  { id: "t8", title: "ריכוז רשימת תרופות קבועות לקשישים במרכז היישוב", category: "רפואה", department: "רפואה", priority: "נמוך", status: "הושלם", done: true, createdAt: minsAgo(36), completedAt: minsAgo(12), replies: [{ timestamp: minsAgo(30), text: "נבדק מול מרפאה" }] },
];

export const DEMO_EVENT_LOGS = [
  { id: "ev1", createdAt: minsAgo(54), reporter: 'חמ"ל', recipient: "כלל המכלולים", department: 'חמ"ל', status: "טופל", description: "הופעלה התרעת צבע אדום ונשמעו נפילות באזור הצפוני — פתיחת חמ״ל והפעלת נוהל ירוק בעיניים" },
  { id: "ev2", createdAt: minsAgo(44), reporter: "רונן כץ", recipient: 'חמ"ל', department: "לוגיסטיקה", status: "בטיפול", description: "נתק חשמל בשכונת ההרחבה הצפונית עקב פגיעה בקו מתח; חברת החשמל עודכנה, צוות לוגיסטיקה פורס גנרטורים" },
  { id: "ev3", createdAt: minsAgo(31), reporter: "מיכל אברהמי", recipient: "רפואה", department: "אוכלוסיה", status: "בטיפול", description: "ריכוז דיווחי תושבים: 3 משפחות זקוקות לסיוע מיידי (מחולל חמצן, דלת ממ״ד, חרדה)" },
  { id: "ev4", createdAt: minsAgo(25), reporter: 'ד"ר יעל שפירא', recipient: 'חמ"ל', department: "רפואה", status: "בטיפול", description: "דיווח על פצוע קל מרסיסי זכוכית בבית 19 בהרחבה הצפונית — חובש במקום, לא נדרש פינוי מוסק" },
  { id: "ev5", createdAt: minsAgo(14), reporter: "אדם רוזנברג", recipient: "תושבים", department: 'חמ"ל', status: "טופל", description: "הופצה הודעת הרגעה והנחיות התגוננות מעודכנות לכלל קבוצות הוואטסאפ ביישוב" },
];
