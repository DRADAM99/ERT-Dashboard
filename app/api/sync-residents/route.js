import { NextResponse } from 'next/server';
import { db } from '../../../firebase';
import { collection, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';

export async function POST(request) {
  try {
    // Parse the request body
    const body = await request.json();
    
    console.log('Received webhook data:', body);
    
    // Validate the request
    if (!body || !body.residents || !Array.isArray(body.residents)) {
      return NextResponse.json(
        { error: 'Invalid request format. Expected residents array.' },
        { status: 400 }
      );
    }

    // Validate required fields for each resident
    const requiredFields = ['timestamp', 'סטטוס', 'שם משפחה', 'שם פרטי', 'טלפון', 'שכונה', 'בית', 'הערות', 'event_id'];
    
    for (let i = 0; i < body.residents.length; i++) {
      const resident = body.residents[i];
      const missingFields = requiredFields.filter(field => !resident[field]);
      
      if (missingFields.length > 0) {
        return NextResponse.json(
          { 
            error: `Resident ${i + 1} missing required fields: ${missingFields.join(', ')}` 
          },
          { status: 400 }
        );
      }
    }

    // Get the residents collection reference
    const residentsRef = collection(db, 'residents');
    
    // Clear existing residents (optional - you might want to merge instead)
    const existingResidents = await getDocs(residentsRef);
    const deletePromises = existingResidents.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    // Add new residents to Firestore
    const addPromises = body.residents.map((resident, index) => {
      const residentDoc = doc(residentsRef);
      return setDoc(residentDoc, {
        ...resident,
        syncedAt: new Date(),
        createdAt: new Date(),
        id: residentDoc.id
      });
    });
    
    await Promise.all(addPromises);
    
    console.log(`Successfully synced ${body.residents.length} residents to Firestore`);
    
    return NextResponse.json({
      success: true,
      message: `Synced ${body.residents.length} residents`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error syncing residents:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// Optional: GET endpoint to check the webhook is working
export async function GET() {
  try {
    const residentsRef = collection(db, 'residents');
    const snapshot = await getDocs(residentsRef);
    const residents = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return NextResponse.json({
      success: true,
      count: residents.length,
      residents: residents.slice(0, 5) // Return first 5 for preview
    });
  } catch (error) {
    console.error('Error fetching residents:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
} 