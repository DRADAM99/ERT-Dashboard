// /app/api/leads/route.js

import { db } from "@/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

// Helper function to create a response with CORS headers
function createResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

// Handle OPTIONS request for CORS
export async function OPTIONS() {
  return createResponse({});
}

export async function POST(req) {
  try {
    // Log the raw request
    console.log("Received lead request:", {
      headers: Object.fromEntries(req.headers),
      url: req.url
    });

    const data = await req.json();
    console.log("Parsed lead data:", data);

    // Validate required fields
    if (!data.full_name || !data.phone) {
      console.error("Missing required fields:", {
        hasFullName: !!data.full_name,
        hasPhone: !!data.phone,
        data
      });
      return createResponse({ 
        error: "Missing required fields",
        details: {
          fullName: !data.full_name ? "missing" : "present",
          phone: !data.phone ? "missing" : "present"
        }
      }, 400);
    }

    // Clean phone number - remove spaces, dashes, etc.
    const cleanPhone = data.phone.replace(/\D/g, '');
    
    // Create the lead document
    const leadData = {
      fullName: data.full_name,
      phoneNumber: cleanPhone,
      message: data.message || "",
      email: data.email || "",
      source: data.source || "unknown",
      status: "חדש",
      createdAt: serverTimestamp(),
      conversationSummary: [],
    };

    console.log("Attempting to save lead:", leadData);

    const docRef = await addDoc(collection(db, "leads"), leadData);

    console.log("Lead saved successfully with ID:", docRef.id);

    return createResponse({ 
      success: true,
      leadId: docRef.id
    });

  } catch (error) {
    console.error("Error saving lead:", {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    
    return createResponse({ 
      error: "Failed to process lead",
      details: error.message,
      type: error.name
    }, 500);
  }
}

