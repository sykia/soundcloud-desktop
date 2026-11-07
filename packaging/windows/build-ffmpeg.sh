#!/usr/bin/env bash
# FFmpeg без внешних кодеков и фильтров; HTTPS использует Windows Schannel.
set -eu
: "${SCRIP_MINGW_SYSROOT:?Укажите каталог MSYS2 clang64}"
: "${SCRIP_FFMPEG_SOURCE:?Укажите исходники FFmpeg 9.0.2}"
: "${SCRIP_FFMPEG_OUTPUT:?Укажите каталог результата}"
kit="$SCRIP_MINGW_SYSROOT"
cd "$SCRIP_FFMPEG_SOURCE"
./configure --enable-cross-compile --target-os=mingw32 --arch=x86_64 --cc="clang --target=x86_64-w64-windows-gnu --sysroot=$kit -fuse-ld=lld -rtlib=compiler-rt -resource-dir=$kit/lib/clang/23" --ar=llvm-ar --ranlib=llvm-ranlib --strip=llvm-strip --extra-ldflags="-L$kit/lib/clang/23/lib/windows" --disable-autodetect --disable-x86asm --disable-programs --disable-doc --disable-debug --disable-static --enable-shared --disable-avfilter --disable-avdevice --enable-schannel
make -j"${SCRIP_BUILD_JOBS:-4}"
mkdir -p "$SCRIP_FFMPEG_OUTPUT"
for library in libavcodec/avcodec-63.dll libavformat/avformat-63.dll libavutil/avutil-61.dll libswresample/swresample-7.dll libswscale/swscale-10.dll; do
    cp "$library" "$SCRIP_FFMPEG_OUTPUT/"
done
