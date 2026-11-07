package org.scrip.app;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.media.*;
import android.media.session.*;
import android.os.*;

/** Foreground-служба удерживает Qt-процесс, а не воспроизводит вторую копию аудио. */
public class PlaybackService extends Service {
    static PlaybackService instance;
    private MediaSession session;
    private PowerManager.WakeLock wakeLock;
    private boolean foreground;
    private static final String CHANNEL = "scrip_playback";
    private static final int NOTIFICATION = 44;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private boolean hasFocus, resumeAfterFocus;
    private String metadataKey = "";
    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) { MediaBridge.dispatch(context, 5, 0); }
    };
    @Override public void onCreate() {
        super.onCreate(); instance = this;
        getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL, "Воспроизведение музыки", NotificationManager.IMPORTANCE_LOW));
        wakeLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SCrip:Playback"); wakeLock.setReferenceCounted(false);
        audioManager = getSystemService(AudioManager.class);
        focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
            .setOnAudioFocusChangeListener(change -> {
                if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
                    resumeAfterFocus = change != AudioManager.AUDIOFOCUS_LOSS && MediaBridge.playing;
                    hasFocus = change != AudioManager.AUDIOFOCUS_LOSS;
                    MediaBridge.dispatch(this, 5, 0);
                } else if (change == AudioManager.AUDIOFOCUS_GAIN && resumeAfterFocus) {
                    resumeAfterFocus = false; hasFocus = true; MediaBridge.dispatch(this, 4, 0);
                }
            }, MediaBridge.MAIN).build();
        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(noisy, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(noisy, filter);
        session = new MediaSession(this, "SCrip");
        session.setSessionActivity(MediaBridge.openApp(this));
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { MediaBridge.dispatch(PlaybackService.this, 4, 0); }
            @Override public void onPause() { MediaBridge.dispatch(PlaybackService.this, 5, 0); }
            @Override public void onStop() { MediaBridge.dispatch(PlaybackService.this, 5, 0); }
            @Override public void onSkipToNext() { MediaBridge.dispatch(PlaybackService.this, 2, 0); }
            @Override public void onSkipToPrevious() { MediaBridge.dispatch(PlaybackService.this, 1, 0); }
            @Override public void onSeekTo(long position) { MediaBridge.dispatch(PlaybackService.this, 3, position); }
        }, MediaBridge.MAIN);
        session.setActive(true);
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (!MediaBridge.ready || !MediaBridge.playing) { stopSelf(); return START_NOT_STICKY; }
        publish(); return START_NOT_STICKY;
    }
    void publish() {
        String key = MediaBridge.title + '\n' + MediaBridge.artist + '\n' + MediaBridge.artwork + '\n' + MediaBridge.duration;
        if (!metadataKey.equals(key)) {
            metadataKey = key;
            MediaMetadata.Builder metadata = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, MediaBridge.title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, MediaBridge.artist)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, MediaBridge.duration);
            if (MediaBridge.cover != null) metadata.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, MediaBridge.cover);
            session.setMetadata(metadata.build());
        }
        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_STOP;
        session.setPlaybackState(new PlaybackState.Builder().setActions(actions)
            .setState(MediaBridge.playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, MediaBridge.position, MediaBridge.playing ? 1f : 0f, SystemClock.elapsedRealtime()).build());
        Notification notification = new Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.widget_notification).setContentTitle(MediaBridge.title).setContentText(MediaBridge.artist)
            .setLargeIcon(MediaBridge.cover).setContentIntent(MediaBridge.openApp(this))
            .setVisibility(Notification.VISIBILITY_PUBLIC).setOnlyAlertOnce(true).setShowWhen(false)
            .setCategory(Notification.CATEGORY_TRANSPORT).setOngoing(MediaBridge.playing)
            .addAction(new Notification.Action.Builder(R.drawable.widget_previous, "Предыдущий", MediaBridge.control(this, 1)).build())
            .addAction(new Notification.Action.Builder(MediaBridge.playing ? R.drawable.widget_pause : R.drawable.widget_play, MediaBridge.playing ? "Пауза" : "Воспроизвести", MediaBridge.control(this, 0)).build())
            .addAction(new Notification.Action.Builder(R.drawable.widget_next, "Следующий", MediaBridge.control(this, 2)).build())
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2)).build();
        if (MediaBridge.playing) {
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(NOTIFICATION, notification);
            foreground = true;
            if (!wakeLock.isHeld()) wakeLock.acquire();
            if (!hasFocus) {
                hasFocus = audioManager.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
                if (!hasFocus) MediaBridge.dispatch(this, 5, 0);
            }
        } else {
            if (foreground) { stopForeground(STOP_FOREGROUND_DETACH); foreground = false; }
            if (wakeLock.isHeld()) wakeLock.release();
            if (hasFocus && !resumeAfterFocus) { audioManager.abandonAudioFocusRequest(focusRequest); hasFocus = false; }
            getSystemService(NotificationManager.class).notify(NOTIFICATION, notification);
        }
        if ("SCrip".equals(MediaBridge.title) && !MediaBridge.playing) stopSelf();
    }
    @Override public void onDestroy() {
        instance = null;
        unregisterReceiver(noisy);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (audioManager != null) audioManager.abandonAudioFocusRequest(focusRequest);
        if (session != null) { session.setActive(false); session.release(); }
        getSystemService(NotificationManager.class).cancel(NOTIFICATION);
        MediaBridge.playing = false; MusicWidget.refresh(this); super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
