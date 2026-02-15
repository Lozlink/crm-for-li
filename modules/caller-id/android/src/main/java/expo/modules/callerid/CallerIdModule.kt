package expo.modules.callerid

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CallLog
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
  }
}

private class MissingActivityException :
  expo.modules.kotlin.exception.CodedException(
    "ERR_CALLER_ID_NO_ACTIVITY",
    "No current activity available to request permissions. Ensure the app is in the foreground.",
    null
  )
