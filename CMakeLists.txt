cmake_minimum_required(VERSION 3.21)
project(SCrip VERSION 1.4.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(Qt6 6.5 REQUIRED COMPONENTS Quick Network Multimedia)
option(SCRIP_MOBILE_PREVIEW "Мобильный интерфейс на компьютере" OFF)
if(ANDROID OR SCRIP_MOBILE_PREVIEW)
    set(main_qml qml/android/Main.qml)
else()
    set(main_qml qml/Main.qml)
endif()
qt_standard_project_setup(REQUIRES 6.5)

qt_add_executable(scrip src/plugins.cpp src/plugins.h src/main.cpp src/soundcloud.cpp src/soundcloud.h src/artworknetwork.cpp src/artworknetwork.h)
set_source_files_properties(${main_qml} PROPERTIES QT_RESOURCE_ALIAS Main.qml)
set_source_files_properties(qml/assets/blob.png PROPERTIES QT_RESOURCE_ALIAS assets/blob.png)
qt_add_qml_module(scrip
    URI SCrip
    VERSION 1.0
    RESOURCES qml/assets/blob.png
    QML_FILES ${main_qml}
)
qt_add_resources(scrip callback_page PREFIX "/" FILES resources/callback.html)
target_link_libraries(scrip PRIVATE Qt6::Quick Qt6::Network Qt6::Multimedia)
if(ANDROID)
    target_sources(scrip PRIVATE src/androidmedia.cpp src/androidmedia.h)
    target_link_options(scrip PRIVATE "-Wl,-z,max-page-size=16384")
    set(SCRIP_ANDROID_OPENSSL_ROOT "$ENV{SCRIP_ANDROID_OPENSSL_ROOT}" CACHE PATH "Каталог android_openssl для Android")
    set(android_ssl_dir "${SCRIP_ANDROID_OPENSSL_ROOT}/ssl_3/${CMAKE_ANDROID_ARCH_ABI}")
    foreach(library libcrypto_3.so libssl_3.so)
        if(NOT EXISTS "${android_ssl_dir}/${library}")
            message(FATAL_ERROR "Укажите SCRIP_ANDROID_OPENSSL_ROOT с библиотеками OpenSSL для ${CMAKE_ANDROID_ARCH_ABI}")
        endif()
        set_property(TARGET scrip APPEND PROPERTY QT_ANDROID_EXTRA_LIBS "${android_ssl_dir}/${library}")
    endforeach()
    set_target_properties(scrip PROPERTIES QT_ANDROID_PACKAGE_NAME org.scrip.app QT_ANDROID_APP_NAME SCrip
        QT_ANDROID_VERSION_CODE 10400 QT_ANDROID_VERSION_NAME "${PROJECT_VERSION}"
        QT_QML_ROOT_PATH "${CMAKE_CURRENT_SOURCE_DIR}/qml/android"
        QT_ANDROID_MIN_SDK_VERSION 28
        QT_ANDROID_PACKAGE_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/packaging/android")
else()
    find_package(Qt6 REQUIRED COMPONENTS Widgets)
    target_link_libraries(scrip PRIVATE Qt6::Widgets)
endif()
set_target_properties(scrip PROPERTIES
    WIN32_EXECUTABLE TRUE
    MACOSX_BUNDLE TRUE
    MACOSX_BUNDLE_GUI_IDENTIFIER org.scrip.app
)

include(CTest)
if(BUILD_TESTING AND NOT ANDROID)
    find_package(Qt6 REQUIRED COMPONENTS Test)
    qt_add_executable(scrip_tests tests/tst_soundcloud.cpp src/soundcloud.cpp src/soundcloud.h)
    qt_add_resources(scrip_tests callback_test PREFIX "/" FILES resources/callback.html)
    target_include_directories(scrip_tests PRIVATE src)
    target_link_libraries(scrip_tests PRIVATE Qt6::Test Qt6::Quick Qt6::Network Qt6::Multimedia)
    target_compile_definitions(scrip_tests PRIVATE SCRIP_SOURCE_DIR="${CMAKE_CURRENT_SOURCE_DIR}")
    qt_add_executable(plugin_tests tests/tst_plugins.cpp src/plugins.cpp src/plugins.h)
    target_include_directories(plugin_tests PRIVATE src)
    target_compile_definitions(plugin_tests PRIVATE SCRIP_SOURCE_DIR="${CMAKE_CURRENT_SOURCE_DIR}")
    target_link_libraries(plugin_tests PRIVATE Qt6::Test)
    add_test(NAME plugins COMMAND plugin_tests)
    set_tests_properties(plugins PROPERTIES ENVIRONMENT "XDG_DATA_HOME=${CMAKE_BINARY_DIR}/test-data")
    if(WIN32)
        target_link_libraries(scrip_tests PRIVATE user32)
        add_test(NAME windows_window_controls COMMAND scrip_tests windowControls)
        set_tests_properties(windows_window_controls PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=windows;QT_QUICK_BACKEND=software" RUN_SERIAL TRUE)
    endif()
    add_test(NAME soundcloud COMMAND scrip_tests)
    set_tests_properties(soundcloud PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

# Тексты лицензий доступны в ресурсах всех платформ и при системной установке.
qt_add_resources(scrip legal_notices PREFIX "/legal" FILES LICENSE THIRD_PARTY_NOTICES.md TRADEMARKS.md)
install(TARGETS scrip RUNTIME DESTINATION bin BUNDLE DESTINATION .)
install(FILES LICENSE DESTINATION share/licenses/scrip)
install(FILES THIRD_PARTY_NOTICES.md TRADEMARKS.md DESTINATION share/doc/scrip)
