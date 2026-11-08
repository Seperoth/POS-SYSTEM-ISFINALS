package expo.modules.posdevice

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.PackageInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class PosDeviceModule : Module() {
  private val context get() = appContext.reactContext ?: throw IOException("App context is unavailable.")
  private val timeoutExecutor = Executors.newSingleThreadScheduledExecutor()

  @SuppressLint("MissingPermission")
  override fun definition() = ModuleDefinition {
    Name("PosDevice")
    AsyncFunction("pairedPrinters") {
      val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter ?: throw IOException("This device has no Bluetooth adapter.")
      if (!adapter.isEnabled) throw IOException("Turn on Bluetooth, then pair your receipt printer in Android Settings.")
      adapter.bondedDevices.map { mapOf("address" to it.address, "name" to (it.name ?: it.address), "type" to it.type) }
    }
    AsyncFunction("bluetoothSettings") {
      context.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    AsyncFunction("printReceipt") { address: String, text: String, paperWidth: Int ->
      if (!address.matches(Regex("[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}"))) throw IOException("Choose a valid paired printer.")
      if (text.length > 100000) throw IOException("Receipt is too long.")
      val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter ?: throw IOException("Bluetooth is unavailable.")
      if (!adapter.isEnabled) throw IOException("Bluetooth is turned off.")
      val device = adapter.bondedDevices.firstOrNull { it.address.equals(address, true) } ?: throw IOException("Pair the printer in Android Settings first.")
      // Classic SPP / ESC-POS. BLE-only label printers need a different protocol.
      val socket = device.createRfcommSocketToServiceRecord(UUID.fromString("00001101-0000-1000-8000-00805F9B34FB"))
      val deadline = timeoutExecutor.schedule({ try { socket.close() } catch (_: Exception) {} }, 30, TimeUnit.SECONDS)
      try {
        socket.connect()
        val out = socket.outputStream
        out.write(byteArrayOf(0x1b, 0x40))
        val width = if (paperWidth == 80) 576 else 384
        val paint = TextPaint().apply { color = Color.BLACK; textSize = 25f; typeface = Typeface.MONOSPACE; isAntiAlias = true }
        val layout = StaticLayout.Builder.obtain(text, 0, text.length, paint, width - 16)
          .setAlignment(Layout.Alignment.ALIGN_NORMAL).setIncludePad(true).setLineSpacing(4f, 1f).build()
        if (layout.height > 60000) throw IOException("Receipt is too long for this printer.")
        // Rasterize in small strips, keeping memory and printer buffers bounded.
        val bytesPerRow = width / 8
        var offset = 0
        while (offset < layout.height) {
          val height = minOf(96, layout.height - offset)
          val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
          val canvas = Canvas(bitmap)
          canvas.drawColor(Color.WHITE)
          canvas.translate(8f, -offset.toFloat())
          layout.draw(canvas)
          val pixels = IntArray(width * height)
          bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
          val raster = ByteArray(bytesPerRow * height)
          for (y in 0 until height) for (x in 0 until width) {
            val p = pixels[y * width + x]
            if ((Color.red(p) + Color.green(p) + Color.blue(p)) / 3 < 160) {
              val index = y * bytesPerRow + x / 8
              raster[index] = (raster[index].toInt() or (0x80 shr (x % 8))).toByte()
            }
          }
          bitmap.recycle()
          out.write(byteArrayOf(0x1d, 0x76, 0x30, 0, (bytesPerRow and 255).toByte(), (bytesPerRow shr 8).toByte(), (height and 255).toByte(), (height shr 8).toByte()))
          out.write(raster)
          out.flush()
          Thread.sleep(80)
          offset += height
        }
        out.write(byteArrayOf(10, 10, 10))
        out.flush()
        Thread.sleep(300)
        true
      } finally {
        deadline.cancel(false)
        try { socket.close() } catch (_: Exception) {}
      }
    }
    AsyncFunction("installPermission") { Build.VERSION.SDK_INT < 26 || context.packageManager.canRequestPackageInstalls() }
    AsyncFunction("installSettings") {
      context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    AsyncFunction("installApk") { uri: String ->
      if (Build.VERSION.SDK_INT >= 26 && !context.packageManager.canRequestPackageInstalls()) throw IOException("Allow this app to install updates in Android Settings, then choose the APK again.")
      val folder = File(context.cacheDir, "updates").apply { mkdirs() }
      val apk = File(folder, "universal-pos-update.apk")
      try {
        context.contentResolver.openInputStream(Uri.parse(uri)).use { input ->
          if (input == null) throw IOException("Cannot read the selected APK.")
          apk.outputStream().use { output ->
            val buffer = ByteArray(65536); var total = 0L
            while (true) { val n = input.read(buffer); if (n < 0) break; total += n; if (total > 300L * 1024 * 1024) throw IOException("APK exceeds 300 MB."); output.write(buffer, 0, n) }
          }
        }
        val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        @Suppress("DEPRECATION")
        val incoming = context.packageManager.getPackageArchiveInfo(apk.absolutePath, flags) ?: throw IOException("This file is not a valid Android APK.")
        @Suppress("DEPRECATION")
        val installed = context.packageManager.getPackageInfo(context.packageName, flags)
        if (incoming.packageName != installed.packageName) throw IOException("This APK belongs to a different app.")
        val newVersion = if (Build.VERSION.SDK_INT >= 28) incoming.longVersionCode else incoming.versionCode.toLong()
        val oldVersion = if (Build.VERSION.SDK_INT >= 28) installed.longVersionCode else installed.versionCode.toLong()
        if (newVersion <= oldVersion) throw IOException("Choose a newer APK version.")
        if (signatures(incoming) != signatures(installed)) throw IOException("This APK was signed with a different key. Request an update signed with the original key.")
        val content = FileProvider.getUriForFile(context, "${context.packageName}.posupdates", apk)
        context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(content, "application/vnd.android.package-archive")
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION))
        true
      } catch (e: Exception) { apk.delete(); throw e }
    }
  }
  @Suppress("DEPRECATION")
  private fun signatures(info: PackageInfo): Set<String> {
    val values = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
    return values?.map { it.toCharsString() }?.toSet()?.takeIf { it.isNotEmpty() } ?: throw IOException("APK signing certificate is missing.")
  }
}
