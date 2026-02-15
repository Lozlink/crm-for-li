package expo.modules.callerid

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONException

/**
 * BroadcastReceiver that listens for incoming phone calls and displays a
 * heads-up notification when the caller matches a synced CRM contact.
 *
 * Contacts are read from SharedPreferences written by [CallerIdModule.syncContacts].
 * Phone number matching compares the last 8 digits to handle international
 * prefix and formatting variations.
 */
class CallerIdReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) {
            return
        }

        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
        if (state != TelephonyManager.EXTRA_STATE_RINGING) {
            return
        }

        val incomingNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)
        if (incomingNumber.isNullOrBlank()) {
            return
        }

        val normalizedIncoming = normalizeNumber(incomingNumber)
        if (normalizedIncoming.isEmpty()) {
            return
        }

        val matchedLabel = findMatchingContact(context, normalizedIncoming) ?: return
        showNotification(context, matchedLabel)
    }

    // region Contact Matching

    /**
     * Read contacts from SharedPreferences and return the label of the first
     * contact whose normalized phone number matches the incoming number
     * (compared by last [MATCH_DIGITS] digits).
     */
    private fun findMatchingContact(context: Context, normalizedIncoming: String): String? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val json = prefs.getString(CONTACTS_KEY, null)
        if (json.isNullOrBlank()) {
            return null
        }

        val contacts = try {
            JSONArray(json)
        } catch (e: JSONException) {
            Log.w(TAG, "Failed to parse caller ID contacts JSON", e)
            return null
        }

        val incomingSuffix = normalizedIncoming.takeLast(MATCH_DIGITS)

        for (i in 0 until contacts.length()) {
            val contact = try {
                contacts.getJSONObject(i)
            } catch (e: JSONException) {
                Log.w(TAG, "Skipping malformed contact at index $i", e)
                continue
            }

            val phone = contact.optString("phone", "")
            val label = contact.optString("label", "")

            if (phone.isEmpty() || label.isEmpty()) {
                continue
            }

            val normalizedContact = normalizeNumber(phone)
            if (normalizedContact.isEmpty()) {
                continue
            }

            val contactSuffix = normalizedContact.takeLast(MATCH_DIGITS)
            if (incomingSuffix == contactSuffix) {
                return label
            }
        }

        return null
    }

    // endregion

    // region Notification

    /**
     * Display a heads-up notification showing the matched CRM contact name.
     */
    private fun showNotification(context: Context, contactLabel: String) {
        val notificationManager =
            context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            )
            notificationManager.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setContentTitle(NOTIFICATION_TITLE)
            .setContentText(contactLabel)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    // endregion

    // region Helpers

    /**
     * Strip a phone number string to digits only.
     * For example "+61 412 345 678" becomes "61412345678".
     */
    private fun normalizeNumber(phone: String): String {
        return phone.filter { it.isDigit() }
    }

    // endregion

    companion object {
        private const val TAG = "CallerIdReceiver"

        private const val PREFS_NAME = "callerid"
        private const val CONTACTS_KEY = "callerid_contacts"

        /** Number of trailing digits to compare for phone number matching. */
        private const val MATCH_DIGITS = 8

        private const val CHANNEL_ID = "caller_id_channel"
        private const val CHANNEL_NAME = "Caller ID"

        private const val NOTIFICATION_TITLE = "CRM Contact Calling"
        private const val NOTIFICATION_ID = 9001
    }
}
