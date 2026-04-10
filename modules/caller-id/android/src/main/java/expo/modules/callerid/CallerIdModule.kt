package expo.modules.callerid

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CallLog
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

private const val PREFS_NAME = "callerid"
private const val CONTACTS_KEY = "callerid_contacts"

class CallerIdModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.AppContextLost()

  override fun definition() = ModuleDefinition {
    Name("CallerId")

    AsyncFunction("syncContacts") { contacts: List<Map<String, String>> ->
      persistContacts(contacts)
    }

    AsyncFunction("isCallerIdEnabled") {
      return@AsyncFunction hasPermission(Manifest.permission.READ_PHONE_STATE)
    }

    AsyncFunction("enableCallerId") {
      val permissions = arrayOf(
        Manifest.permission.READ_PHONE_STATE,
        Manifest.permission.READ_CALL_LOG,
        Manifest.permission.POST_NOTIFICATIONS
      )

      // Check if all permissions are already granted
      val allGranted = permissions.all { hasPermission(it) }
      if (allGranted) {
        return@AsyncFunction true
      }

      // Request permissions through the activity
      val activity = appContext.currentActivity
        ?: throw MissingActivityException()

      activity.requestPermissions(permissions, PERMISSION_REQUEST_CODE)

      // Return current state; the JS side should re-check after the user responds
      return@AsyncFunction permissions.all { hasPermission(it) }
    }

    AsyncFunction("getRecentCalls") { sinceTimestamp: Double ->
      if (!hasPermission(Manifest.permission.READ_CALL_LOG)) {
        return@AsyncFunction emptyList<Map<String, Any>>()
      }

      return@AsyncFunction queryRecentCalls(sinceTimestamp.toLong())
    }

    AsyncFunction("hasSmsPermission") {
      return@AsyncFunction hasPermission(Manifest.permission.SEND_SMS)
    }

    AsyncFunction("requestSmsPermission") {
      if (hasPermission(Manifest.permission.SEND_SMS)) {
        return@AsyncFunction true
      }

      val activity = appContext.currentActivity
        ?: throw MissingActivityException()

      activity.requestPermissions(
        arrayOf(Manifest.permission.SEND_SMS),
        SMS_PERMISSION_REQUEST_CODE
      )

      return@AsyncFunction hasPermission(Manifest.permission.SEND_SMS)
    }

    AsyncFunction("sendDirectSms") { phone: String, message: String ->
      if (!hasPermission(Manifest.permission.SEND_SMS)) {
        return@AsyncFunction mapOf("success" to false, "error" to "SEND_SMS permission not granted")
      }

      try {
        val smsManager = SmsManager.getDefault()
        // Split long messages into parts
        val parts = smsManager.divideMessage(message)
        if (parts.size == 1) {
          smsManager.sendTextMessage(phone, null, message, null, null)
        } else {
          smsManager.sendMultipartTextMessage(phone, null, parts, null, null)
        }
        return@AsyncFunction mapOf("success" to true, "error" to null)
      } catch (e: Exception) {
        return@AsyncFunction mapOf("success" to false, "error" to (e.message ?: "Unknown error"))
      }
    }
  }

  // region Private Helpers

  /**
   * Serialize contacts to JSON and persist in SharedPreferences.
   */
  private fun persistContacts(contacts: List<Map<String, String>>) {
    val jsonArray = JSONArray()
    for (contact in contacts) {
      val obj = JSONObject()
      obj.put("phone", contact["phone"] ?: "")
      obj.put("label", contact["label"] ?: "")
      jsonArray.put(obj)
    }

    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(CONTACTS_KEY, jsonArray.toString())
      .apply()
  }

  /**
   * Check whether a specific permission is granted.
   */
  private fun hasPermission(permission: String): Boolean {
    return ContextCompat.checkSelfPermission(context, permission) ==
      PackageManager.PERMISSION_GRANTED
  }

  /**
   * Query the system CallLog for calls since the given timestamp.
   */
  private fun queryRecentCalls(sinceTimestamp: Long): List<Map<String, Any>> {
    val calls = mutableListOf<Map<String, Any>>()

    val projection = arrayOf(
      CallLog.Calls.NUMBER,
      CallLog.Calls.DATE,
      CallLog.Calls.DURATION,
      CallLog.Calls.TYPE
    )

    val selection = "${CallLog.Calls.DATE} > ?"
    val selectionArgs = arrayOf(sinceTimestamp.toString())
    val sortOrder = "${CallLog.Calls.DATE} DESC"

    val cursor = context.contentResolver.query(
      CallLog.Calls.CONTENT_URI,
      projection,
      selection,
      selectionArgs,
      sortOrder
    )

    cursor?.use {
      val numberIdx = it.getColumnIndex(CallLog.Calls.NUMBER)
      val dateIdx = it.getColumnIndex(CallLog.Calls.DATE)
      val durationIdx = it.getColumnIndex(CallLog.Calls.DURATION)
      val typeIdx = it.getColumnIndex(CallLog.Calls.TYPE)

      while (it.moveToNext()) {
        val callType = when (it.getInt(typeIdx)) {
          CallLog.Calls.INCOMING_TYPE -> "incoming"
          CallLog.Calls.OUTGOING_TYPE -> "outgoing"
          CallLog.Calls.MISSED_TYPE -> "missed"
          else -> "missed"
        }

        calls.add(
          mapOf(
            "phone" to (it.getString(numberIdx) ?: ""),
            "timestamp" to it.getLong(dateIdx),
            "duration" to it.getLong(durationIdx),
            "type" to callType
          )
        )
      }
    }

    return calls
  }

  // endregion

  companion object {
    private const val PERMISSION_REQUEST_CODE = 1001
    private const val SMS_PERMISSION_REQUEST_CODE = 1002
  }
}

private class MissingActivityException :
  expo.modules.kotlin.exception.CodedException(
    "ERR_CALLER_ID_NO_ACTIVITY",
    "No current activity available to request permissions. Ensure the app is in the foreground.",
    null
  )
