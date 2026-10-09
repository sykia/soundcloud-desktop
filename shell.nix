{ pkgs ? import <nixpkgs> { } }:

# Run the npm-downloaded Electron in an FHS environment without replacing it
# with another Electron version or changing the machine's global configuration.
(pkgs.buildFHSEnv {
  name = "soundcloud-desktop-dev";
  targetPkgs = p: with p; [
    nodejs_22 git bash coreutils zlib
    alsa-lib at-spi2-atk cairo cups dbus expat gdk-pixbuf glib gtk3 gtk4
    nss nspr pango systemd libnotify libsecret libpulseaudio
    libdrm libgbm libxkbcommon libxshmfence libGL vulkan-loader
    libx11 libxcb libxcomposite libxdamage libxext libxfixes libxrandr
    stdenv.cc.cc
  ];
  profile = ''
    export XDG_DATA_DIRS="${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:''${XDG_DATA_DIRS:-/usr/share}"
  '';
  runScript = "bash";
}).env
