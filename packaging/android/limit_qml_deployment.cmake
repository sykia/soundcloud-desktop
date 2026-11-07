# Qt 6.10 дописывает корень проекта к QML roots. SDK и исходники в build/
# не должны попадать в APK. Выполняется перед Android deployment каждой ABI.
if(NOT EXISTS "${DEPLOYMENT_FILE}")
    message(FATAL_ERROR "Нет deployment settings: ${DEPLOYMENT_FILE}")
endif()
file(READ "${DEPLOYMENT_FILE}" deployment)
file(TO_CMAKE_PATH "${QML_ROOT}" qml_root)
string(JSON deployment SET "${deployment}" "qml-root-path" "[\"${qml_root}\"]")
file(WRITE "${DEPLOYMENT_FILE}" "${deployment}\n")
