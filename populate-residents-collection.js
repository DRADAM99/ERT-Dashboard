import { db } from './firebase.js';
import { collection, doc, setDoc } from 'firebase/firestore';

// Sample residents data with the specified field structure
const sampleResidents = [
  {
    timestamp: new Date('2025-08-01T10:00:00.000Z'),
    'סטטוס': 'כולם בסדר',
    'שם משפחה': 'כהן',
    'שם פרטי': 'יוסי',
    'טלפון': '050-1234567',
    'שכונה': 'הרצליה',
    'בית': '123',
    'הערות': 'תושב חדש, צריכים לעקוב אחרי המצב',
    'event_id': 'EVT-001'
  },
  {
    timestamp: new Date('2025-08-01T10:15:00.000Z'),
    'סטטוס': 'זקוקים לסיוע',
    'שם משפחה': 'מזרחי',
    'שם פרטי': 'שרה',
    'טלפון': '052-7654321',
    'שכונה': 'נווה שאנן',
    'בית': '456',
    'הערות': 'צריכים עזרה דחופה, משפחה עם ילדים קטנים',
    'event_id': 'EVT-002'
  },
  {
    timestamp: new Date('2025-08-01T10:30:00.000Z'),
    'סטטוס': 'לא בטוח',
    'שם משפחה': 'גנץ',
    'שם פרטי': 'בני',
    'טלפון': '054-9876543',
    'שכונה': 'קריית אליעזר',
    'בית': '789',
    'הערות': 'חלק מהמשפחה בחו"ל, כרגע רק ההורים בבית',
    'event_id': 'EVT-003'
  },
  {
    timestamp: new Date('2025-08-01T10:45:00.000Z'),
    'סטטוס': 'זקוקים לסיוע',
    'שם משפחה': 'לוי',
    'שם פרטי': 'דנה',
    'טלפון': '054-1122334',
    'שכונה': 'הדר',
    'בית': '321',
    'הערות': 'קשישים, צריכים עזרה עם תרופות',
    'event_id': 'EVT-004'
  },
  {
    timestamp: new Date('2025-08-01T11:00:00.000Z'),
    'סטטוס': 'כולם בסדר',
    'שם משפחה': 'גולדברג',
    'שם פרטי': 'משה',
    'טלפון': '053-9988776',
    'שכונה': 'בת גלים',
    'בית': '654',
    'הערות': 'משפחה גדולה, 6 ילדים, כולם בסדר',
    'event_id': 'EVT-005'
  },
  {
    timestamp: new Date('2025-08-01T11:15:00.000Z'),
    'סטטוס': 'לא בטוח',
    'שם משפחה': 'ברק',
    'שם פרטי': 'רחל',
    'טלפון': '050-5544332',
    'שכונה': 'רמת הנשיא',
    'בית': '987',
    'הערות': 'אין מידע על כל בני הבית, צריך לבדוק',
    'event_id': 'EVT-006'
  },
  {
    timestamp: new Date('2025-08-01T11:30:00.000Z'),
    'סטטוס': 'זקוקים לסיוע',
    'שם משפחה': 'פרץ',
    'שם פרטי': 'אברהם',
    'טלפון': '052-1122334',
    'שכונה': 'קריית שפרינצק',
    'בית': '147',
    'הערות': 'אנחנו זקוקים לסיוע, אין חשמל',
    'event_id': 'EVT-007'
  },
  {
    timestamp: new Date('2025-08-01T11:45:00.000Z'),
    'סטטוס': 'לא בטוח',
    'שם משפחה': 'שפירא',
    'שם פרטי': 'מיכל',
    'טלפון': '054-5566778',
    'שכונה': 'נווה דוד',
    'בית': '258',
    'הערות': 'לא כולם בבית, כולם בסדר',
    'event_id': 'EVT-008'
  }
];

async function populateResidentsCollection() {
  try {
    console.log('Starting to populate Residents collection...');
    
    const residentsRef = collection(db, 'residents');
    
    // Add each resident to Firestore
    const addPromises = sampleResidents.map((resident, index) => {
      const residentDoc = doc(residentsRef);
      return setDoc(residentDoc, {
        ...resident,
        id: residentDoc.id,
        syncedAt: new Date(),
        createdAt: new Date()
      });
    });
    
    await Promise.all(addPromises);
    
    console.log(`✅ Successfully populated Residents collection with ${sampleResidents.length} residents`);
    console.log('Sample data structure:');
    console.log(JSON.stringify(sampleResidents[0], null, 2));
    
  } catch (error) {
    console.error('❌ Error populating Residents collection:', error);
  }
}

// Run the population script
populateResidentsCollection(); 