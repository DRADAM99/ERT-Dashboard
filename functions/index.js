const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.sendNotificationOnCreate = functions.firestore
    .document("users/{userId}/notifications/{notificationId}")
    .onCreate(async (snapshot, context) => {
      const {userId} = context.params;
      const notificationData = snapshot.data();

      // Get the user's settings
      const settingsRef = admin.firestore()
          .doc(`users/${userId}/notificationSettings/settings`);
      const settingsSnap = await settingsRef.get();
      const settings = settingsSnap.data() || {};

      // Determine if this notification type is enabled
      let isEnabled = true;
      const {type, subType} = notificationData;
      if (type && subType && settings[type] && settings[type][subType]) {
        isEnabled = settings[type][subType].enabled;
      }

      if (!isEnabled) {
        console.log(`Notifications disabled for type: ${type}.${subType}`);
        return null;
      }

      // Get FCM tokens for the user
      const tokensSnap = await admin.firestore()
          .collection(`users/${userId}/fcmTokens`)
          .get();

      if (tokensSnap.empty) {
        console.log("No FCM tokens for user:", userId);
        return null;
      }

      const tokens = tokensSnap.docs.map((doc) => doc.id);

      const payload = {
        notification: {
          title: "New Notification",
          body: notificationData.message,
        },
        webpush: {
          notification: {
            icon: "/favicon.ico",
          },
          fcm_options: {
            link: notificationData.link || "/",
          },
        },
      };

      try {
        const response = await admin.messaging().sendToDevice(tokens, payload);
        console.log("Successfully sent message:", response);

        // Cleanup invalid tokens
        response.results.forEach((result, index) => {
          const error = result.error;
          if (error) {
            console.error("Failure sending notification to",
                tokens[index], error);
            if (error.code === "messaging/invalid-registration-token" ||
              error.code === "messaging/registration-token-not-registered") {
              // Delete the invalid token
              admin.firestore()
                  .collection(`users/${userId}/fcmTokens`)
                  .doc(tokens[index]).delete();
            }
          }
        });
      } catch (error) {
        console.error("Error sending message:", error);
      }
      return null;
    });

