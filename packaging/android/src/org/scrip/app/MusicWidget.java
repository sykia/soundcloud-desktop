package org.scrip.app;

import android.app.*;
import android.appwidget.*;
import android.content.*;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.RemoteViews;

public class MusicWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) { MediaBridge.restore(context); refresh(context); }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) { onUpdate(context, manager, new int[]{id}); }
    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if ("org.scrip.app.MEDIA_CONTROL".equals(intent.getAction())) {
            MediaBridge.dispatch(context, intent.getIntExtra("control", 0), 0);
        }
    }
    static String time(long ms) {
        long seconds = Math.max(0, ms) / 1000;
        return String.format(java.util.Locale.ROOT, "%d:%02d", seconds / 60, seconds % 60);
    }
    static RemoteViews views(Context context) {
        RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.music_widget);
        view.setTextViewText(R.id.widget_title, MediaBridge.title);
        view.setTextViewText(R.id.widget_artist, MediaBridge.artist);
        view.setTextViewText(R.id.widget_elapsed, time(MediaBridge.position));
        view.setTextViewText(R.id.widget_remaining, "−" + time(MediaBridge.duration - MediaBridge.position));
        view.setProgressBar(R.id.widget_progress, 1000, MediaBridge.duration > 0 ? (int)Math.min(1000, MediaBridge.position * 1000 / MediaBridge.duration) : 0, false);
        view.setImageViewBitmap(R.id.widget_cover, MediaBridge.roundedCover(context));
        view.setImageViewResource(R.id.widget_play, MediaBridge.playing ? R.drawable.widget_pause : R.drawable.widget_play);
        view.setContentDescription(R.id.widget_play, MediaBridge.playing ? "Пауза" : "Воспроизвести");
        view.setOnClickPendingIntent(R.id.widget_info, MediaBridge.openApp(context));
        view.setOnClickPendingIntent(R.id.widget_previous, MediaBridge.control(context, 1));
        view.setOnClickPendingIntent(R.id.widget_play, MediaBridge.control(context, 0));
        view.setOnClickPendingIntent(R.id.widget_next, MediaBridge.control(context, 2));
        Intent volume = new Intent(Build.VERSION.SDK_INT >= 29 ? Settings.Panel.ACTION_VOLUME : Settings.ACTION_SOUND_SETTINGS);
        view.setOnClickPendingIntent(R.id.widget_output, PendingIntent.getActivity(context, 22, volume, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return view;
    }
    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, MusicWidget.class));
        if (ids.length > 0) manager.updateAppWidget(ids, views(context));
    }
}
