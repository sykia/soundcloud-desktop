package org.scrip.app;

import android.app.*;
import android.appwidget.AppWidgetManager;
import android.content.*;
import android.graphics.*;
import android.os.*;
import android.util.Log;
import org.json.JSONObject;

/** Общий снимок настоящего Qt-плеера: без второго источника музыки или очереди. */
public final class MediaBridge {
    static final Handler MAIN = new Handler(Looper.getMainLooper());
    static Context context;
    static volatile boolean ready;
    static volatile boolean preparing;
    static String title = "SCrip", artist = "Включи музыку в приложении", artwork = "";
    static boolean playing;
    static long position, duration;
    static Bitmap cover;
    private static String savedKey = "";
    private MediaBridge() {}
    private static native void nativeAction(int action, long position);

    public static void initialize(Context ctx) {
        context = ctx.getApplicationContext(); ready = true;
    }
    /** Start the foreground service while the activity is still visible, before Qt starts decoding audio. */
    public static void preparePlayback() {
        if (!ready || context == null) return;
        preparing = true;
        MAIN.post(() -> {
            try { context.startForegroundService(new Intent(context, PlaybackService.class)); }
            catch (IllegalStateException | SecurityException error) { Log.w("SCripMedia", "Не удалось подготовить фоновое воспроизведение", error); }
        });
        MAIN.postDelayed(() -> {
            if (!preparing || PlaybackService.instance == null) return;
            preparing = false;
            context.stopService(new Intent(context, PlaybackService.class));
        }, 30000);
    }
    public static void shutdown() {
        ready = false;
        MAIN.post(() -> {
            playing = false;
            if (context != null) {
                context.stopService(new Intent(context, PlaybackService.class));
                save(); MusicWidget.refresh(context);
            }
        });
    }
    public static void update(String json) {
        MAIN.post(() -> {
            if (!ready || context == null) return;
            try {
                JSONObject data = new JSONObject(json);
                String nextTitle = data.optString("title");
                title = nextTitle.isEmpty() ? "SCrip" : nextTitle;
                artist = nextTitle.isEmpty() ? "Включи музыку в приложении" : data.optString("artist");
                playing = data.optBoolean("playing");
                boolean buffering = data.optBoolean("buffering");
                position = Math.max(0, data.optLong("position"));
                duration = Math.max(0, data.optLong("duration"));
                String nextArtwork = data.optString("artwork");
                if (!nextArtwork.equals(artwork)) {
                    artwork = nextArtwork;
                    cover = artwork.isEmpty() ? null : BitmapFactory.decodeFile(artwork);
                }
                save(); MusicWidget.refresh(context);
                if (playing) preparing = false;
                else if (!buffering) preparing = false;
                if (playing && PlaybackService.instance == null) {
                    try { context.startForegroundService(new Intent(context, PlaybackService.class)); }
                    catch (IllegalStateException | SecurityException error) { Log.w("SCripMedia", "Не удалось запустить фоновый плеер", error); }
                } else if (PlaybackService.instance != null && (!preparing || playing)) PlaybackService.instance.publish();
            } catch (org.json.JSONException error) { Log.w("SCripMedia", "Некорректное состояние плеера", error); }
        });
    }
    private static void save() {
        // Диск обновляется при смене трека/паузы, а не каждую секунду.
        String key = title + '\n' + artist + '\n' + artwork + '\n' + playing;
        if (key.equals(savedKey)) return;
        savedKey = key;
        context.getSharedPreferences("music_widget", Context.MODE_PRIVATE).edit()
            .putString("title", title).putString("artist", artist).putString("artwork", artwork)
            .putLong("position", position).putLong("duration", duration).apply();
    }
    static void restore(Context ctx) {
        if (context == null) context = ctx.getApplicationContext();
        if (ready) return;
        android.content.SharedPreferences p = context.getSharedPreferences("music_widget", Context.MODE_PRIVATE);
        title = p.getString("title", "SCrip"); artist = p.getString("artist", "Включи музыку в приложении");
        artwork = p.getString("artwork", ""); cover = artwork.isEmpty() ? null : BitmapFactory.decodeFile(artwork);
        position = p.getLong("position", 0); duration = p.getLong("duration", 0); playing = false;
    }
    static void dispatch(Context ctx, int action, long value) {
        if (ready) nativeAction(action, value);
        else {
            Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
            if (launch != null) { launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); ctx.startActivity(launch); }
        }
    }
    static PendingIntent openApp(Context ctx) {
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        return PendingIntent.getActivity(ctx, 20, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static PendingIntent control(Context ctx, int action) {
        Intent intent = new Intent(ctx, MusicWidget.class).setAction("org.scrip.app.MEDIA_CONTROL").putExtra("control", action);
        return PendingIntent.getBroadcast(ctx, action, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static Bitmap roundedCover(Context ctx) {
        Bitmap source = cover;
        if (source == null) source = BitmapFactory.decodeResource(ctx.getResources(), R.drawable.icon);
        if (source == null) return null;
        Bitmap result = Bitmap.createBitmap(128, 128, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(result); Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        BitmapShader shader = new BitmapShader(source, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
        float scale = Math.max(128f / source.getWidth(), 128f / source.getHeight());
        Matrix matrix = new Matrix(); matrix.setScale(scale, scale);
        matrix.postTranslate((128 - source.getWidth() * scale) / 2, (128 - source.getHeight() * scale) / 2);
        shader.setLocalMatrix(matrix); paint.setShader(shader); canvas.drawRoundRect(0, 0, 128, 128, 18, 18, paint);
        return result;
    }
    public static boolean pinWidget() {
        if (context == null) return false;
        AppWidgetManager widgets = AppWidgetManager.getInstance(context);
        if (!widgets.isRequestPinAppWidgetSupported()) return false;
        MAIN.post(() -> widgets.requestPinAppWidget(new ComponentName(context, MusicWidget.class), null, null));
        return true;
    }
}
