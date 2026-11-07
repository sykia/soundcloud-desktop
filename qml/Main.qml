import QtQuick
import QtQuick.Controls
import QtQuick.Controls.Basic as Basic
import QtQuick.Controls.impl as ControlsImpl
import QtQuick.Layouts
import QtQuick.Dialogs as Dialogs
import QtCore

Window {
    id: app
    width: 1320; height: 820
    minimumWidth: 760; minimumHeight: 560
    visible: true
    title: "SCrip"
    flags: Qt.Window | Qt.FramelessWindowHint
    color: "transparent"
    readonly property var api: Object.assign({}, sc.state)
    readonly property var extensions: typeof pluginManager === "undefined" ? null : pluginManager
    readonly property var pluginTheme: extensions ? extensions.theme : ({})
    readonly property var themes: JSON.parse(prefs.savedThemes)
    readonly property var chosenTheme: themes.find(t => t.name === prefs.themeName)
    readonly property color accent: chosenTheme?.accent ?? pluginTheme.accent ?? "#f43756"
    readonly property color surface: chosenTheme ? Qt.tint("white", Qt.alpha(accent, chosenTheme.tint / 100)) : "white"
    readonly property color panel: chosenTheme ? Qt.tint(surface, Qt.alpha(accent, 0.05)) : "#f7f7f8"
    function foreground(c) {
        function linear(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
        return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b) > 0.179 ? "#111113" : "#ffffff"
    }
    readonly property int artworkRadius: pluginTheme.coverRadius ?? prefs.coverRadius
    property string pluginMessage: ""
    Dialogs.FileDialog {
        id: pluginPicker
        title: "Установить плагин SCrip"
        nameFilters: ["Плагины SCrip (*.json)"]
        onAccepted: app.pluginMessage = app.extensions.install(selectedFile) || "Плагин установлен. Включите его ниже."
    }
    readonly property color ink: "#242426"
    readonly property color muted: "#858589"
    property int section: 5
    property int category: 0
    property int settingGroup: 0
    property string query: ""
    property string libraryPage: "likes"
    property int profileTab: 0
    property var guest: null
    readonly property var displayedProfile: guest ? (api.visitedProfile?.urn === guest.urn ? api.visitedProfile : guest) : api.profile
    function openProfile(user) {
        guest = user && user.urn !== api.profile.urn ? user : null
        const reload = section === 3 && profileTab === 0
        profileTab = 0
        section = 3
        if (reload) refreshPage()
    }
    property bool inspectorOpen: true
    readonly property bool dockedInspector: width >= 1100 && inspectorOpen
    readonly property int inspectorWidth: dockedInspector ? (width >= 1300 ? 280 : 256) : 0
    readonly property int gutter: 24
    readonly property int motion: prefs.motion ? prefs.animationMs : 0
    readonly property string pageTitle: section === 4 && settingGroup === 1 ? "Плагины" : section === 1 ? (libraryPage === "likes" ? "Любимые треки" : libraryPage === "history" ? "Недавно слушали" : "Лента") : pages[section]
    property bool lastSignedIn: false
    readonly property var pages: ["Поиск", "Любимые треки", "Плейлисты", "Профиль", "Настройки", "Главная"]
    readonly property bool compact: width < 1000

    Settings { id: prefs; category: "appleInterface"; property bool gridView: true; property real volume: 0.7; property bool motion: true
        property string hiddenMixTracks: "{}"
        property string savedThemes: "[]"
        property string themeName: ""
        property int animationMs: 240
        property int coverRadius: 8
        property int avatarRoundness: 50
        property int panelRadius: 12
        property bool autoLoad: true
    }
    function time(ms) { const s = Math.max(0, Math.floor((ms || 0) / 1000)); return Math.floor(s / 60) + ":" + (s % 60).toString().padStart(2, "0") }
    function refreshPage() {
        if (!sc.signedIn) return
        if (section === 0) sc.browse(["tracks", "sets", "users"][category], query)
        else if (section === 1) sc.browse(libraryPage)
        else if (section === 2) sc.browse("playlists")
        else if (section === 3) sc.browse(guest ? ["userTracks", "userSets"][profileTab] : ["mine", "playlists", "likes", "reposts"][profileTab], guest?.urn || "")
        else if (section === 5) sc.loadHome()
    }
    function searchNow() { query = searchField.text; if (section !== 0) section = 0; else refreshPage() }
    function selectLibrary(page) { libraryPage = page; if (section !== 1) section = 1; else refreshPage() }
    function imageUrl(url) {
        if (!url) return ""
        return url.replace("-large.", "-t300x300.")
    }
    function cover(item) { if (pluginTheme.covers === "artist" && item.user?.avatar_url) return imageUrl(item.user.avatar_url); return imageUrl(item.artwork_url || item.tracks?.[0]?.artwork_url || item.user?.avatar_url || "") }
    function maximize() { if (visibility === Window.Maximized) showNormal(); else showMaximized() }
    onSectionChanged: { refreshPage(); if (prefs.motion) pageTransition.restart() }
    onProfileTabChanged: { if (section === 3) refreshPage() }
    onDockedInspectorChanged: { if (dockedInspector) queuePopup.close() }
    function toggleInspector() {
        if (width >= 1100) inspectorOpen = !inspectorOpen
        else if (queuePopup.opened) queuePopup.close(); else queuePopup.open()
    }
    onCategoryChanged: { if (section === 0) refreshPage() }
    Connections {
        target: sc
        function onSignedInChanged() {
            const newlySignedIn = sc.signedIn && !app.lastSignedIn
            app.lastSignedIn = sc.signedIn
            if (newlySignedIn) { app.section = 5; Qt.callLater(app.refreshPage); app.requestActivate() }
        }
    }
    Component.onCompleted: { lastSignedIn = sc.signedIn; if (lastSignedIn) refreshPage() }
    Shortcut { sequences: [StandardKey.Find]; onActivated: { searchField.forceActiveFocus(); searchField.selectAll() } }
    Shortcut { sequence: "F11"; onActivated: app.visibility === Window.FullScreen ? app.showNormal() : app.showFullScreen() }

    component Txt: Text {
        color: app.ink; font.pixelSize: 13; textFormat: Text.PlainText
        elide: Text.ElideRight; renderType: Text.QtRendering
    }
    component Glyph: Canvas {
        property string name: "music"
        property color ink: app.ink
        width: 20; height: 20
        onNameChanged: requestPaint()
        onInkChanged: requestPaint()
        onPaint: {
            const c = getContext("2d"); c.reset(); c.scale(width / 24, height / 24)
            c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 1.65; c.lineCap = "round"; c.lineJoin = "round"; c.beginPath()
            switch (name) {
            case "search": c.arc(10,10,6,0,Math.PI*2); c.moveTo(15,15); c.lineTo(21,21); break
            case "home": c.moveTo(3,11); c.lineTo(12,3); c.lineTo(21,11); c.moveTo(5,10); c.lineTo(5,21); c.lineTo(10,21); c.lineTo(10,14); c.lineTo(14,14); c.lineTo(14,21); c.lineTo(19,21); c.lineTo(19,10); break
            case "liked": case "heart": c.moveTo(12,21); c.bezierCurveTo(-5,10,5,-2,12,7); c.bezierCurveTo(19,-2,29,10,12,21); if (name === "liked") c.fill(); break
            case "music": c.moveTo(9,17); c.lineTo(9,5); c.lineTo(20,3); c.lineTo(20,15); c.moveTo(9,8); c.lineTo(20,6); c.moveTo(9,17); c.ellipse(6,18,3,2,0,0,Math.PI*2); c.moveTo(20,15); c.ellipse(17,16,3,2,0,0,Math.PI*2); break
            case "grid": for(let y=4;y<20;y+=9) for(let x=4;x<20;x+=9) c.rect(x,y,6,6); break
            case "list": for(let y=6;y<21;y+=6) { c.moveTo(8,y); c.lineTo(21,y); c.moveTo(3,y); c.lineTo(3.2,y) } break
            case "clock": c.arc(12,12,9,0,Math.PI*2); c.moveTo(12,6); c.lineTo(12,12); c.lineTo(16,14); break
            case "profile": c.arc(12,8,3.5,0,Math.PI*2); c.moveTo(4,21); c.bezierCurveTo(4,12,20,12,20,21); break
            case "settings": for(let y=5;y<22;y+=7) { const x=y===12?15:8; c.moveTo(3,y); c.lineTo(x-2,y); c.moveTo(x+2,y); c.lineTo(21,y); c.moveTo(x+2,y); c.arc(x,y,2,0,Math.PI*2) } break
            case "play": c.moveTo(8,4); c.lineTo(20,12); c.lineTo(8,20); c.closePath(); c.fill(); return
            case "pause": c.rect(6,4,4,16); c.rect(14,4,4,16); c.fill(); return
            case "next": c.moveTo(4,5); c.lineTo(14,12); c.lineTo(4,19); c.closePath(); c.fill(); c.moveTo(16,5); c.lineTo(16,19); break
            case "previous": c.moveTo(20,5); c.lineTo(10,12); c.lineTo(20,19); c.closePath(); c.fill(); c.moveTo(8,5); c.lineTo(8,19); break
            case "plus": c.moveTo(12,5); c.lineTo(12,19); c.moveTo(5,12); c.lineTo(19,12); break
            case "close": c.moveTo(6,6); c.lineTo(18,18); c.moveTo(6,18); c.lineTo(18,6); break
            case "volume": c.moveTo(4,9); c.lineTo(8,9); c.lineTo(13,5); c.lineTo(13,19); c.lineTo(8,15); c.lineTo(4,15); c.closePath(); c.moveTo(17,8); c.quadraticCurveTo(22,12,17,16); break
            case "repeat": c.moveTo(5,9); c.lineTo(5,6); c.lineTo(19,6); c.lineTo(19,10); c.moveTo(16,7); c.lineTo(19,10); c.lineTo(22,7); c.moveTo(19,15); c.lineTo(19,18); c.lineTo(5,18); c.lineTo(5,14); c.moveTo(2,17); c.lineTo(5,14); c.lineTo(8,17); break
            case "shuffle": c.moveTo(3,6); c.bezierCurveTo(12,6,12,18,21,18); c.moveTo(18,15); c.lineTo(21,18); c.lineTo(18,21); c.moveTo(3,18); c.bezierCurveTo(12,18,12,6,21,6); c.moveTo(18,3); c.lineTo(21,6); c.lineTo(18,9); break
            case "cloud": c.moveTo(6,18); c.bezierCurveTo(-1,18,0,10,6,10); c.bezierCurveTo(6,1,19,1,19,10); c.bezierCurveTo(25,10,25,18,19,18); c.closePath(); break
            case "back": c.translate(24,0); c.scale(-1,1);
            case "arrow": c.moveTo(5,12); c.lineTo(19,12); c.moveTo(14,7); c.lineTo(19,12); c.lineTo(14,17); break
            }
            c.stroke()
        }
    }
    component Tool: AbstractButton {
        id: tool
        property string symbol: ""
        property bool active: false
        property bool primary: false
        property bool round: false
        implicitWidth: symbol ? 32 : Math.max(76, toolLabel.implicitWidth + 24)
        implicitHeight: 30
        hoverEnabled: true
        Accessible.name: text
        property bool showHint: true
        ToolTip.visible: showHint && hovered && !!symbol; ToolTip.text: text; ToolTip.delay: 500
        opacity: enabled ? 1 : 0.4
        scale: down ? 0.96 : 1
        Behavior on scale { NumberAnimation { duration: app.motion / 2; easing.type: Easing.OutCubic } }
        background: Rectangle {
            radius: tool.round ? height / 2 : 7
            color: tool.primary ? (tool.down ? Qt.darker(app.accent, 1.12) : app.accent) : tool.down ? "#dedcdf" : tool.active ? "#eae7e9" : tool.hovered ? "#efedef" : "transparent"
            border.color: tool.primary || tool.symbol ? "transparent" : "#dedbde"
            Behavior on color { ColorAnimation { duration: app.motion / 2 } }
        }
        contentItem: Item {
            Glyph { visible: !!tool.symbol; anchors.centerIn: parent; width: 18; height: 18; name: tool.symbol; ink: tool.primary ? app.foreground(app.accent) : tool.active ? app.accent : app.ink }
            Txt { id: toolLabel; visible: !tool.symbol; anchors.centerIn: parent; width: Math.min(implicitWidth, tool.width - 16); text: tool.text; color: tool.primary ? app.foreground(app.accent) : app.ink; font.pixelSize: 12; horizontalAlignment: Text.AlignHCenter }
        }
    }
    component LikeButton: Tool {
        required property var track
        active: !!track.user_favorite
        symbol: active ? "liked" : "heart"
        text: active ? "Лайк поставлен · Убрать" : "Поставить лайк"
        Accessible.checkable: true
        Accessible.checked: active
        onClicked: sc.like(track)
    }
    component Field: TextField {
        height: 34; color: app.ink; font.pixelSize: 13; selectByMouse: true
        leftPadding: 10; rightPadding: 10; placeholderTextColor: "#9a969b"
        background: Rectangle { radius: 7; color: "white"; border.color: parent.activeFocus ? app.accent : "#dddadd" }
    }
    component LineSlider: Slider {
        id: lineSlider
        implicitHeight: 22; padding: 0
        background: Rectangle {
            x: lineSlider.leftPadding; y: (lineSlider.height-height)/2
            width: lineSlider.availableWidth; height: 3; radius: 2; color: "#d7d4d6"
            Rectangle { width: lineSlider.visualPosition * parent.width; height: parent.height; radius: 2; color: "#777278" }
        }
        handle: Rectangle {
            x: lineSlider.visualPosition * (lineSlider.availableWidth - width); y: (lineSlider.height-height)/2
            width: 8; height: 8; radius: 4; color: "#777278"; visible: lineSlider.hovered || lineSlider.pressed
        }
    }
    component VolumeSlider: LineSlider {
        readonly property real level: app.api.volume || 0
        value: level <= 0.3 ? level / 0.6 : 0.5 + (level - 0.3) / 1.4
        live: true
        snapMode: Slider.NoSnap
        onMoved: sc.volume(value <= 0.5 ? value * 0.6 : 0.3 + (value - 0.5) * 1.4)
        Accessible.name: "Громкость"
        Accessible.description: Math.round(level * 100) + "%"
    }
    component NavItem: AbstractButton {
        id: navItem
        property string symbol: "music"
        property bool selected: false
        width: parent.width; height: 36; hoverEnabled: true
        background: Rectangle { radius: 7; color: navItem.selected ? "#eaeaec" : navItem.hovered ? "#efeff1" : "transparent"; Behavior on color { ColorAnimation { duration: app.motion / 2 } } }
        contentItem: Row {
            leftPadding: 10; spacing: 9
            Glyph { anchors.verticalCenter: parent.verticalCenter; width: 17; height: 17; name: navItem.symbol; ink: navItem.selected ? app.accent : "#454247" }
            Txt { width: navItem.width - 44; anchors.verticalCenter: parent.verticalCenter; text: navItem.text; color: navItem.selected ? app.accent : app.ink; font.pixelSize: 12 }
        }
    }

    Rectangle {
        id: shell
        anchors.fill: parent; radius: app.visibility === Window.Maximized || app.visibility === Window.FullScreen ? 0 : 14
        color: app.surface; border.color: "#d2cfd3"; clip: true

        Rectangle {
            id: sidebar
            x: 1; y: 1; width: 196; height: parent.height - 2
            visible: sc.signedIn; color: app.panel; radius: shell.radius
            Rectangle { anchors.right: parent.right; width: 15; height: parent.height; color: parent.color }
            Rectangle { anchors.right: parent.right; width: 1; height: parent.height; color: "#e6e2e5" }
            Column {
                x: 16; y: 76; width: parent.width - 32; spacing: 4
                NavItem { text: "Главная"; symbol: "home"; selected: app.section === 5; onClicked: app.section = 5 }
                NavItem { text: "Поиск"; symbol: "search"; selected: app.section === 0; onClicked: { app.section = 0; searchField.forceActiveFocus() } }
                NavItem { text: "Лента"; symbol: "list"; selected: app.section === 1 && app.libraryPage === "feed"; onClicked: app.selectLibrary("feed") }
                Item { width: 1; height: 20 }
                Txt { text: "Медиатека"; color: app.muted; font.pixelSize: 11; leftPadding: 10; height: 23 }
                NavItem { text: "Любимые треки"; symbol: "heart"; selected: app.section === 1 && app.libraryPage === "likes"; onClicked: app.selectLibrary("likes") }
                NavItem { text: "Недавние"; symbol: "clock"; selected: app.section === 1 && app.libraryPage === "history"; onClicked: app.selectLibrary("history") }
                NavItem { text: "Плейлисты"; symbol: "grid"; selected: app.section === 2; onClicked: app.section = 2 }
                NavItem { text: "Мой профиль"; symbol: "profile"; selected: app.section === 3 && !app.guest; onClicked: app.openProfile(null) }
                Item { width: 1; height: 20 }
                Txt { text: "Приложение"; color: app.muted; font.pixelSize: 11; leftPadding: 10; height: 23 }
                NavItem { text: "Настройки"; symbol: "settings"; selected: app.section === 4; onClicked: { app.settingGroup = 0; app.section = 4 } }
            }
            AbstractButton {
                x: 14; anchors.bottom: parent.bottom; anchors.bottomMargin: 14
                width: parent.width - 28; height: 38; onClicked: app.openProfile(null)
                contentItem: Row {
                    spacing: 8
                    Avatar { width: 28; height: 28; anchors.verticalCenter: parent.verticalCenter; source: app.imageUrl(app.api.profile.avatar_url || "") }
                    Txt { width: parent.width - 38; anchors.verticalCenter: parent.verticalCenter; text: app.api.profile.username || "Аккаунт"; font.pixelSize: 12 }
                }
            }
        }
        Item {
            id: titlebar
            x: 0; y: 0; width: parent.width; height: 56
            MouseArea { anchors.fill: parent; onPressed: app.startSystemMove(); onDoubleClicked: app.maximize() }
            Row {
                x: 19; y: 22; spacing: 8
                Repeater {
                    model: ["#ff5f57", "#febc2e", "#28c840"]
                    AbstractButton {
                        required property string modelData
                        required property int index
                        width: 12; height: 12; hoverEnabled: true
                        Accessible.name: ["Закрыть", "Свернуть", "Развернуть"][index]
                        background: Rectangle { radius: 6; color: parent.modelData; border.width: 0.6; border.color: Qt.darker(color, 1.12) }
                        contentItem: Txt { text: parent.hovered ? ["×", "−", "+"][parent.index] : ""; color: "#704436"; font.pixelSize: 11; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter }
                        onClicked: index === 0 ? app.close() : index === 1 ? app.showMinimized() : app.maximize()
                    }
                }
            }
            Txt {
                x: sidebar.width + 1 + app.gutter; anchors.verticalCenter: parent.verticalCenter; visible: sc.signedIn
                width: Math.max(80, parent.width - x - app.inspectorWidth - 330)
                text: "SCrip"
                color: app.muted
                font.pixelSize: 14; font.weight: Font.DemiBold
            }
            Row {
                visible: sc.signedIn; anchors.right: parent.right; anchors.rightMargin: app.inspectorWidth + app.gutter; anchors.verticalCenter: parent.verticalCenter; spacing: 8
                Tool { symbol: prefs.gridView ? "list" : "grid"; text: prefs.gridView ? "Показать списком" : "Показать обложки"; visible: (app.section !== 4 && app.section !== 5); onClicked: prefs.gridView = !prefs.gridView }
                Rectangle {
                    width: app.width < 1200 ? 195 : 240; height: 30; radius: 15; color: "#f6f5f6"; border.color: "#efedef"
                    Glyph { x: 10; anchors.verticalCenter: parent.verticalCenter; width: 14; height: 14; name: "search"; ink: "#8e898e" }
                    Basic.TextField {
                        id: searchField; verticalAlignment: TextInput.AlignVCenter; x: 29; width: parent.width - 36; height: parent.height
                        background: null; leftPadding: 0; topPadding: 0; bottomPadding: 0; font.pixelSize: 12
                        color: app.ink; placeholderText: "Поиск в SoundCloud"; placeholderTextColor: "#99949a"; selectByMouse: true
                        text: app.query; onAccepted: app.searchNow()
                    }
                }
            }
        }
        Rectangle {
            id: detailColumn
            visible: sc.signedIn && app.dockedInspector
            x: parent.width - app.inspectorWidth - 1; y: 1
            width: app.inspectorWidth; height: parent.height - y - player.height - 1
            color: app.chosenTheme ? app.panel : "#fafafa"; radius: shell.radius
            Rectangle { width: 14; height: parent.height; color: parent.color }
            Rectangle { width: 1; height: parent.height; color: "#eaeaec" }
            Inspector { anchors.fill: parent; anchors.margins: app.gutter; anchors.topMargin: 20; onDismiss: app.inspectorOpen = false }
        }
        Item {
            id: musicArea
            visible: sc.signedIn
            x: sidebar.width + 1; y: 57; width: parent.width - x - app.inspectorWidth - 1; height: parent.height - y - 1
            Flickable {
                id: contentScroll
                objectName: "libraryScroll"
                anchors.fill: parent; anchors.leftMargin: app.gutter; anchors.rightMargin: app.gutter; anchors.bottomMargin: 100
                clip: true; contentWidth: width; contentHeight: pageBody.height + 24
                boundsBehavior: Flickable.StopAtBounds
                flickDeceleration: 1500; maximumFlickVelocity: 3600
                property real wheelTarget: 0
                function maybeLoad() {
                    if (prefs.autoLoad && app.section < 4 && app.api.hasMore && !app.api.busy && !app.api.error && contentY + height >= contentHeight - 240) sc.more()
                }
                onContentYChanged: autoLoadTimer.restart()
                onContentHeightChanged: autoLoadTimer.restart()
                onHeightChanged: autoLoadTimer.restart()
                Timer { id: autoLoadTimer; interval: 160; onTriggered: contentScroll.maybeLoad() }
                readonly property bool paginationReady: app.api.hasMore && !app.api.busy && !app.api.error && prefs.autoLoad
                onPaginationReadyChanged: autoLoadTimer.restart()
                onMovementStarted: wheelMotion.stop()
                NumberAnimation { id: wheelMotion; target: contentScroll; property: "contentY"; duration: Math.min(150, app.motion); easing.type: Easing.OutCubic }
                WheelHandler {
                    acceptedDevices: PointerDevice.Mouse
                    onWheel: event => {
                        if (event.pixelDelta.y !== 0 || event.angleDelta.y === 0) { event.accepted = false; return }
                        const end = Math.max(0, contentScroll.contentHeight - contentScroll.height)
                        const sameDirection = (contentScroll.wheelTarget - contentScroll.contentY) * event.angleDelta.y < 0
                        const base = wheelMotion.running && sameDirection ? contentScroll.wheelTarget : contentScroll.contentY
                        contentScroll.wheelTarget = Math.max(0, Math.min(end, base - event.angleDelta.y / 120 * 176))
                        wheelMotion.stop()
                        if (prefs.motion) { wheelMotion.to = contentScroll.wheelTarget; wheelMotion.start() }
                        else contentScroll.contentY = contentScroll.wheelTarget
                        event.accepted = true
                    }
                }
                ScrollBar.vertical: ScrollBar { id: pageBar }
                Connections { target: app; function onSectionChanged() { wheelMotion.stop(); contentScroll.contentY = 0; contentScroll.wheelTarget = 0 } }
                Column {
                    id: pageBody; width: Math.max(0, contentScroll.width - pageBar.implicitWidth - 4); spacing: app.gutter
                    property real entrance: 0
                    transform: Translate { y: pageBody.entrance }
                    ParallelAnimation {
                        id: pageTransition
                        NumberAnimation { target: pageBody; property: "opacity"; from: 0.45; to: 1; duration: app.motion }
                        NumberAnimation { target: pageBody; property: "entrance"; from: 8; to: 0; duration: app.motion; easing.type: Easing.OutCubic }
                    }
                    Item { width: 1; height: 8 }
                    Column {
                        visible: app.section !== 3; width: parent.width; spacing: 8
                        Txt { width: parent.width; text: app.pageTitle; font.pixelSize: 30; font.weight: Font.DemiBold; font.letterSpacing: -0.7 }
                        Txt { visible: app.section !== 4; width: parent.width; color: app.muted; text: app.section === 5 ? "Музыка из ваших подписок и новые открытия" : app.section === 0 ? (app.query ? "Результаты поиска · " + app.query : "Музыка и исполнители SoundCloud") : app.api.tracks.length + " в подборке"; font.pixelSize: 12 }
                    }
                    Loader { width: parent.width; active: app.section === 3; visible: active; sourceComponent: profileHeader }
                    Rectangle {
                        visible: !!app.api.error; width: parent.width; height: errorLabel.implicitHeight + 24
                        radius: 8; color: "#fff1f2"
                        Txt { id: errorLabel; x: 12; y: 12; width: parent.width - 52; wrapMode: Text.WordWrap; elide: Text.ElideNone; text: app.api.error || ""; color: "#b44150"; font.pixelSize: 12 }
                        Tool { anchors.right: parent.right; anchors.rightMargin: 6; anchors.verticalCenter: parent.verticalCenter; symbol: "close"; text: "Закрыть сообщение"; onClicked: sc.clearError() }
                    }
                    Row {
                        width: parent.width; spacing: 8; visible: app.section === 0 || app.section === 2
                        Tool { visible: app.section === 0; text: "Треки"; active: app.category === 0; onClicked: app.category = 0 }
                        Tool { visible: app.section === 0; text: "Плейлисты"; active: app.category === 1; onClicked: app.category = 1 }
                        Tool { visible: app.section === 0; text: "Профили"; active: app.category === 2; onClicked: app.category = 2 }
                        Tool { visible: app.section === 2; text: "Создать плейлист"; onClicked: playlistDialog.open() }
                        Tool { symbol: "repeat"; text: "Обновить"; onClicked: app.refreshPage() }
                    }
                    Loader { width: parent.width; active: app.section === 4; visible: active; sourceComponent: app.settingGroup === 1 ? pluginsPage : settingsPage }
                    Repeater {
                        model: app.extensions ? app.extensions.panels.filter(g => g.page === (app.section === 5 ? "home" : app.section === 3 ? "profile" : "-")) : []
                        FormBlock {
                            id: extensionPanel
                            required property var modelData
                            width: pageBody.width
                            heading: modelData.label
                            Txt { width: parent.width; visible: !!text; text: extensionPanel.modelData.text || ""; wrapMode: Text.Wrap }
                            Flow {
                                width: parent.width; spacing: 8
                                Repeater {
                                    model: extensionPanel.modelData.buttons || []
                                    Tool {
                                        required property var modelData
                                        text: modelData.label
                                        width: Math.min(implicitWidth, extensionPanel.width)
                                        onClicked: {
                                            switch (modelData.action) {
                                            case "profile": app.openProfile(null); break
                                            case "playlists": app.section = 2; break
                                            case "search": app.section = 0; searchField.forceActiveFocus(); break
                                            case "likes": case "history": case "feed": app.selectLibrary(modelData.action); break
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Loader { width: parent.width; active: app.section === 5; visible: active; sourceComponent: homePage }
                    Loader { id: collectionLoader; width: parent.width; active: (app.section !== 4 && app.section !== 5); visible: active; sourceComponent: app.section === 0 && app.category === 2 ? userResults : prefs.gridView ? coverGrid : trackList }
                    BusyIndicator { visible: app.api.busy && (app.section !== 4 && app.section !== 5); running: visible; width: 32; height: 32; anchors.horizontalCenter: parent.horizontalCenter }
                    Column {
                        visible: (app.section !== 4 && app.section !== 5) && !app.api.busy && app.api.tracks.length === 0
                        width: parent.width; topPadding: 90; spacing: 12
                        Glyph { name: app.section === 0 ? "search" : app.section === 2 ? "grid" : "music"; width: 42; height: 42; ink: "#c5c0c5"; anchors.horizontalCenter: parent.horizontalCenter }
                        Txt { width: parent.width; horizontalAlignment: Text.AlignHCenter; font.pixelSize: 19; font.weight: Font.DemiBold; text: app.section === 0 ? "Найдите любимую музыку" : app.section === 2 ? "Ваши плейлисты" : "Пока нет треков" }
                        Txt { width: parent.width; horizontalAlignment: Text.AlignHCenter; color: app.muted; text: app.section === 0 ? "Введите название трека или исполнителя в поиске." : app.section === 2 ? "Создайте первый плейлист — он появится и в SoundCloud." : "Здесь появится музыка из вашей коллекции SoundCloud."; wrapMode: Text.WordWrap }
                    }
                    Tool { visible: app.api.hasMore && app.section < 4 && (!prefs.autoLoad || !!app.api.error); text: app.api.error ? "Повторить загрузку" : "Загрузить ещё"; enabled: !app.api.busy; anchors.horizontalCenter: parent.horizontalCenter; onClicked: { sc.clearError(); sc.more() } }
                }
            }
            Rectangle {
                id: player
                readonly property bool hasTrack: !!app.api.current.urn || !!app.api.current.id
                readonly property bool narrow: width < 790
                x: 0; anchors.bottom: parent.bottom
                width: shell.width - musicArea.x - 1; height: 84
                color: app.chosenTheme ? app.panel : "#fcfcfd"; radius: shell.radius
                Rectangle { width: parent.width; height: parent.radius; color: parent.color }
                Rectangle { width: parent.radius; height: parent.height; color: parent.color }
                Rectangle { width: parent.width; height: 1; color: "#dfdfe3" }

                RowLayout {
                    anchors.fill: parent; anchors.leftMargin: player.narrow ? 14 : 24
                    anchors.rightMargin: player.narrow ? 14 : 24; spacing: player.narrow ? 8 : 16
                    Rectangle {
                        Layout.preferredWidth: 50; Layout.preferredHeight: 50
                        radius: app.artworkRadius; color: Qt.tint("#faf9fa", Qt.alpha(app.accent, 0.09))
                        Artwork { id: dockArt; anchors.fill: parent; source: app.cover(app.api.current); visible: !!source }
                        Glyph { visible: !dockArt.visible; anchors.centerIn: parent; width: 24; height: 24; name: "music"; ink: app.accent }
                    }
                    ColumnLayout {
                        Layout.fillWidth: true; Layout.preferredWidth: 175; Layout.minimumWidth: 52; spacing: 3
                        Txt { Layout.fillWidth: true; text: app.api.current.title || "Выберите трек"; font.pixelSize: 14; font.weight: Font.DemiBold }
                        Txt { Layout.fillWidth: true; visible: !!text; text: app.api.buffering ? "Загрузка…" : app.api.current.user?.username || ""; font.pixelSize: 12; color: app.muted }
                    }
                    ColumnLayout {
                        Layout.fillWidth: true; Layout.preferredWidth: 310; Layout.maximumWidth: 460; spacing: 0
                        Row {
                            Layout.alignment: Qt.AlignHCenter; spacing: player.narrow ? 2 : 6
                            Tool { showHint: false; anchors.verticalCenter: parent.verticalCenter; symbol: "shuffle"; active: app.api.shuffle; text: "Перемешать"; onClicked: sc.setShuffle(!app.api.shuffle) }
                            Tool { showHint: false; anchors.verticalCenter: parent.verticalCenter; symbol: "previous"; text: "Предыдущий трек"; enabled: player.hasTrack; onClicked: sc.previous() }
                            Tool {
                                showHint: false
                                symbol: app.api.playing ? "pause" : "play"; text: app.api.playing ? "Пауза" : "Воспроизвести"
                                implicitWidth: 38; implicitHeight: 38; primary: true; round: true
                                enabled: player.hasTrack; opacity: 1; onClicked: sc.togglePlayback()
                                background: Rectangle { radius: width / 2; color: parent.enabled ? app.accent : "#a7a7af" }
                            }
                            Tool { showHint: false; anchors.verticalCenter: parent.verticalCenter; symbol: "next"; text: "Следующий трек"; enabled: !!app.api.queue?.length; onClicked: sc.next() }
                            Tool { showHint: false; anchors.verticalCenter: parent.verticalCenter; symbol: "repeat"; active: app.api.repeat; text: "Повтор трека"; onClicked: sc.setRepeat(!app.api.repeat) }
                        }
                        RowLayout {
                            visible: player.hasTrack; Layout.fillWidth: true; spacing: 8
                            Txt { text: app.time(app.api.position); color: app.muted; font.pixelSize: 10 }
                            LineSlider { Layout.fillWidth: true; implicitHeight: 17; from: 0; to: Math.max(1, app.api.duration || 1); value: app.api.position || 0; onMoved: sc.seek(value); Accessible.name: "Позиция трека" }
                            Txt { text: app.time(app.api.duration); color: app.muted; font.pixelSize: 10 }
                        }
                    }
                    Item { Layout.fillWidth: true; Layout.preferredWidth: player.narrow ? 0 : 48 }
                    LikeButton { showHint: false; visible: player.hasTrack; track: app.api.current }
                    RowLayout {
                        Layout.fillWidth: false
                        Layout.minimumWidth: implicitWidth
                        Layout.maximumWidth: implicitWidth
                        spacing: 12
                        Tool { showHint: false; symbol: "list"; text: "Очередь воспроизведения"; active: app.dockedInspector || queuePopup.opened; onClicked: app.toggleInspector() }
                        Glyph { visible: !player.narrow; name: "volume"; Layout.preferredWidth: 18; Layout.preferredHeight: 18; ink: app.muted }
                        VolumeSlider { visible: !player.narrow; Layout.minimumWidth: 96; Layout.preferredWidth: 96; Layout.maximumWidth: 96 }
                    }
                }
            }
        }

        Column {
            objectName: "welcomeScreen"
            visible: !sc.signedIn
            anchors.centerIn: parent; width: Math.min(460, parent.width - 64); spacing: 16
            BrandMark { anchors.horizontalCenter: parent.horizontalCenter; width: 144; height: width }
            Txt {
                width: parent.width; text: "Добро пожаловать в SCrip"
                horizontalAlignment: Text.AlignHCenter; wrapMode: Text.WordWrap; elide: Text.ElideNone
                font.pixelSize: 30; font.weight: Font.DemiBold; font.letterSpacing: -0.9
            }
            Txt {
                width: parent.width; text: "Войдите, чтобы слушать свои треки и плейлисты."
                horizontalAlignment: Text.AlignHCenter; wrapMode: Text.WordWrap; color: app.muted
            }
            Tool {
                anchors.horizontalCenter: parent.horizontalCenter; width: 222; height: 44; primary: true
                text: app.api.authStep === "exchange" ? "Завершаем вход…" : app.api.authBusy ? "Окно входа открыто" : "Войти в SoundCloud"
                enabled: !app.api.authBusy; onClicked: sc.login()
            }
            Txt { visible: app.api.authStep === "browser"; width: parent.width; text: "Завершите вход в отдельном окне.\nSCrip откроет медиатеку автоматически."; horizontalAlignment: Text.AlignHCenter; color: app.muted; wrapMode: Text.WordWrap; lineHeight: 1.4 }
            Txt { visible: !!app.api.error; width: parent.width; text: app.api.error || ""; color: "#bc3b4a"; wrapMode: Text.WordWrap; horizontalAlignment: Text.AlignHCenter; font.pixelSize: 12 }
            Row {
                anchors.horizontalCenter: parent.horizontalCenter; spacing: 8
                Tool { visible: app.api.authStep === "browser"; text: "Отменить"; onClicked: sc.cancelLogin() }
            }
        }
    }
    Component {
        id: homePage
        Column {
            width: parent.width; spacing: app.gutter
            readonly property var mixes: app.api.home.filter(s => s.mix)
            Txt { visible: parent.mixes.length > 0; text: "Ваши миксы"; font.pixelSize: 21; font.weight: Font.DemiBold }
            Repeater {
                model: parent.mixes
                delegate: RowLayout {
                    id: mix
                    required property var modelData
                    readonly property string storageKey: (app.api.profile.urn || "") + "/" + modelData.title
                    readonly property var hidden: JSON.parse(prefs.hiddenMixTracks)[storageKey] || []
                    readonly property var songs: modelData.tracks.filter(t => !hidden.includes(t.urn))
                    width: parent.width; spacing: 16
                    Column {
                        Layout.preferredWidth: Math.min(184, mix.width * 0.28); spacing: 5
                        Artwork {
                            width: parent.width; height: width; source: app.cover(mix.modelData.tracks[0])
                            TapHandler { onTapped: sc.playMix(mix.songs, 0) }
                        }
                        Txt { width: parent.width; text: mix.modelData.title; font.weight: Font.DemiBold }
                        Txt { text: mix.songs.length + " в подборке"; color: app.muted }
                    }
                    ColumnLayout {
                        Layout.fillWidth: true; Layout.alignment: Qt.AlignTop
                        ListView {
                            id: mixList
                            Layout.fillWidth: true; Layout.preferredHeight: Math.min(5, count) * 42
                            clip: true; model: mix.songs
                            ScrollBar.vertical: ScrollBar { id: mixBar }
                            delegate: RowLayout {
                                id: song
                                required property var modelData
                                required property int index
                                width: mixList.width - mixBar.implicitWidth; height: 42; spacing: 2
                                AbstractButton {
                                    Layout.fillWidth: true; Layout.minimumWidth: 0
                                    Accessible.name: song.modelData.title
                                    onClicked: sc.playMix(mix.songs, song.index)
                                    contentItem: Column {
                                        Txt { width: parent.width; text: song.modelData.title || "Трек"; font.weight: Font.Medium }
                                        Txt { width: parent.width; text: song.modelData.user?.username || ""; color: app.muted; font.pixelSize: 11 }
                                    }
                                }
                                LikeButton { track: song.modelData }
                                Tool { symbol: "plus"; text: "Добавить в альбом"; onClicked: albumPicker.begin(song.modelData) }
                                Tool { symbol: "close"; text: "Убрать из микса"; onClicked: {
                                    const all = JSON.parse(prefs.hiddenMixTracks)
                                    all[mix.storageKey] = mix.hidden.concat([song.modelData.urn])
                                    prefs.hiddenMixTracks = JSON.stringify(all)
                                } }
                            }
                        }
                        Tool { visible: mix.hidden.length > 0; text: "Вернуть скрытые"; onClicked: {
                            const all = JSON.parse(prefs.hiddenMixTracks)
                            delete all[mix.storageKey]
                            prefs.hiddenMixTracks = JSON.stringify(all)
                        } }
                    }
                }
            }
            Repeater {
                model: {
                    const shelves = app.api.home
                    const artists = new Set()
                    const seeds = []
                    for (const shelf of shelves) for (const track of shelf.tracks) {
                        const id = track.user?.urn
                        if (id && !artists.has(id) && seeds.length < 16) { artists.add(id); seeds.push(track) }
                    }
                    return (seeds.length ? [{title: "Станции исполнителей", station: true, tracks: seeds}] : []).concat(shelves.filter(s => !s.mix))
                }
                delegate: Column {
                    id: shelf
                    required property var modelData
                    width: parent.width; spacing: 8
                    RowLayout {
                        width: parent.width; spacing: 12
                        ColumnLayout {
                            Layout.fillWidth: true; spacing: 4
                            Txt { Layout.fillWidth: true; text: shelf.modelData.title; font.pixelSize: 21; font.weight: Font.DemiBold }
                            Txt { Layout.fillWidth: true; visible: !!shelf.modelData.subtitle; text: shelf.modelData.subtitle || ""; color: app.muted }
                        }
                        Tool { visible: cards.contentWidth > cards.width; enabled: !cards.atXBeginning; text: "Прокрутить влево"; symbol: "back"; onClicked: cards.stepPage(-1) }
                        Tool { visible: cards.contentWidth > cards.width; enabled: !cards.atXEnd; text: "Прокрутить вправо"; symbol: "arrow"; onClicked: cards.stepPage(1) }
                    }
                    ListView {
                        id: cards
                        width: parent.width; height: cardHeight + shelfBar.implicitHeight + 4
                        function stepPage(direction) {
                            cancelFlick()
                            const start = shelfMotion.running ? shelfMotion.to : contentX
                            shelfMotion.stop()
                            const end = Math.max(originX, Math.min(originX + contentWidth - width, start + direction * (cardWidth + spacing)))
                            if (!app.motion) { contentX = end; return }
                            shelfMotion.to = end
                            shelfMotion.start()
                        }
                        onMovementStarted: shelfMotion.stop()
                        NumberAnimation { id: shelfMotion; target: cards; property: "contentX"; duration: app.motion; easing.type: Easing.OutCubic }
                        readonly property real cardHeight: cardWidth + 52
                        readonly property int cardWidth: Math.floor((width - (slots - 1) * spacing) / slots)
                        readonly property int slots: Math.max(2, Math.floor((width + spacing) / 170))
                        orientation: ListView.Horizontal; spacing: 16; clip: true
                        model: shelf.modelData.tracks
                        ScrollBar.horizontal: ScrollBar { id: shelfBar }
                        delegate: AbstractButton {
                            id: card
                            required property var modelData
                            required property int index
                            width: cards.cardWidth; height: cards.cardHeight
                            Accessible.name: modelData.title || "Слушать"
                            onClicked: shelf.modelData.station ? sc.playStation(modelData) : sc.playMix(shelf.modelData.tracks, index)
                            background: Item {}
                            contentItem: Column {
                                spacing: 4
                                Artwork { width: card.width; height: width; radius: shelf.modelData.station ? width / 2 : app.artworkRadius; source: shelf.modelData.station ? app.imageUrl(card.modelData.user?.avatar_url) || app.cover(card.modelData) : app.cover(card.modelData) }
                                Txt { width: card.width; text: shelf.modelData.station ? card.modelData.user.username : card.modelData.title || "Без названия"; font.weight: Font.Medium }
                                Txt { width: card.width; text: shelf.modelData.station ? "Станция исполнителя" : card.modelData.user?.username || ""; color: app.muted; font.pixelSize: 12 }
                            }
                            scale: pressed && prefs.motion ? 0.97 : 1
                            Behavior on scale { NumberAnimation { duration: app.motion / 2; easing.type: Easing.OutCubic } }
                        }
                    }
                }
            }
            BusyIndicator { visible: app.api.homeBusy; running: visible; width: 32; height: 32 }
            Txt { visible: !!app.api.homeError; width: parent.width; text: app.api.homeError; color: app.muted; wrapMode: Text.WordWrap }
            Txt { visible: !app.api.homeBusy && !app.api.homeError && !app.api.home.length; width: parent.width; text: "Добавьте любимые треки или подпишитесь на исполнителей, чтобы здесь появились подборки."; wrapMode: Text.WordWrap }
            Tool { text: "Обновить главную"; enabled: !app.api.homeBusy; onClicked: sc.loadHome(true) }
        }
    }
    Component {
        id: userResults
        Column {
            spacing: 6
            Repeater {
                model: app.api.tracks
                delegate: AbstractButton {
                    id: person
                    required property var modelData
                    width: parent.width; height: 58
                    Accessible.name: modelData.username || "Профиль"
                    onClicked: app.openProfile(modelData)
                    background: Rectangle { radius: 8; color: person.hovered ? app.panel : "transparent" }
                    contentItem: RowLayout {
                        spacing: 12
                        Avatar { Layout.preferredWidth: 44; Layout.preferredHeight: 44; source: app.imageUrl(person.modelData.avatar_url) }
                        Txt { Layout.fillWidth: true; text: person.modelData.username || "Профиль"; font.weight: Font.Medium }
                        Glyph { name: "arrow"; width: 18; height: 18; ink: app.muted }
                    }
                }
            }
        }
    }
    Component {
        id: coverGrid
        Grid {
            id: grid
            columns: Math.max(2, Math.floor((width + 24) / 184)); spacing: 24
            Repeater {
                model: app.api.tracks
                delegate: Item {
                    id: tile
                    required property var modelData
                    required property int index
                    readonly property bool playlist: (modelData.urn || "").indexOf("soundcloud:playlists:") === 0
                    width: (grid.width - (grid.columns - 1) * grid.spacing) / grid.columns
                    height: width + 48
                    property bool entered: !prefs.motion
                    readonly property bool inViewport: collectionLoader.y + y < contentScroll.contentY + contentScroll.height && collectionLoader.y + y + height > contentScroll.contentY
                    onInViewportChanged: { if (inViewport) entered = true }
                    Component.onCompleted: { if (inViewport) entered = true }
                    opacity: entered || !prefs.motion ? 1 : 0
                    transform: Translate { y: tile.entered || !prefs.motion ? 0 : 12; Behavior on y { NumberAnimation { duration: prefs.motion ? app.motion + 80 : 0; easing.type: Easing.OutCubic } } }
                    Behavior on opacity { NumberAnimation { duration: prefs.motion ? app.motion + 80 : 0; easing.type: Easing.OutCubic } }
                    HoverHandler { id: tileHover }
                    Rectangle {
                        id: artwork; width: parent.width; height: width; radius: app.artworkRadius; color: "#f1eded"; border.color: "#eeeaec"; clip: true
                        Glyph { anchors.centerIn: parent; width: 40; height: 40; name: tile.playlist ? "grid" : "music"; ink: "#c6b6bf" }
                        Artwork { anchors.fill: parent; source: app.cover(tile.modelData); }
                        TapHandler { onTapped: sc.play(tile.modelData) }
                        Rectangle { anchors.fill: parent; radius: parent.radius; color: "transparent"; border.color: "#14000000" }
                        Rectangle {
                            visible: !tile.playlist
                            anchors.right: parent.right; anchors.top: parent.top; anchors.margins: 8
                            width: 30; height: 30; radius: 15; color: "white"
                            LikeButton { anchors.fill: parent; round: true; track: tile.modelData }
                        }
                        Rectangle {
                            visible: tileHover.hovered; anchors.right: parent.right; anchors.bottom: parent.bottom; anchors.margins: 9
                            width: 32; height: 32; radius: 16; color: "#f5ffffff"
                            Tool { anchors.fill: parent; round: true; symbol: tile.playlist ? "arrow" : "play"; text: tile.playlist ? "Открыть плейлист" : "Слушать"; onClicked: sc.play(tile.modelData) }
                        }
                        Rectangle {
                            visible: tileHover.hovered && !tile.playlist; x: 9; y: 9; width: 27; height: 27; radius: 14; color: "#f5ffffff"
                            Tool { anchors.fill: parent; round: true; symbol: "plus"; text: "Добавить в очередь"; onClicked: sc.enqueue(tile.modelData) }
                        }
                    }
                    Txt { x: 0; y: artwork.height + 8; width: parent.width; text: tile.modelData.title || "Без названия"; font.pixelSize: 13 }
                    Txt { x: 0; y: artwork.height + 25; width: parent.width; text: tile.modelData.user?.username || (tile.playlist ? (tile.modelData.track_count || 0) + " треков" : "SoundCloud"); color: app.muted; font.pixelSize: 11; TapHandler { enabled: !!tile.modelData.user?.urn; onTapped: app.openProfile(tile.modelData.user) } }
                }
            }
        }
    }
    Component {
        id: trackList
        Column {
            Repeater {
                model: app.api.tracks
                delegate: Rectangle {
                    id: row
                    required property var modelData
                    required property int index
                    width: parent.width; height: 58; radius: 5
                    color: app.api.current.urn === modelData.urn ? "#fff0f2" : rowHover.hovered ? "#f6f5f6" : index % 2 ? "#faf9fa" : "white"
                    HoverHandler { id: rowHover }
                    RowLayout {
                        anchors.fill: parent; anchors.margins: 7; spacing: 10
                        Tool { symbol: "play"; text: "Слушать"; onClicked: sc.play(row.modelData); implicitWidth: 24 }
                        Artwork { width: 40; height: 40; source: app.cover(row.modelData); }
                        ColumnLayout {
                            Layout.fillWidth: true; spacing: 4
                            Txt { Layout.fillWidth: true; text: row.modelData.title || "Без названия"; font.pixelSize: 12 }
                            Txt { Layout.fillWidth: true; text: row.modelData.user?.username || "SoundCloud"; color: app.muted; font.pixelSize: 11; TapHandler { enabled: !!row.modelData.user?.urn; onTapped: app.openProfile(row.modelData.user) } }
                        }
                        LikeButton { visible: (row.modelData.urn || "").startsWith("soundcloud:tracks:"); track: row.modelData }
                        Tool { visible: (row.modelData.urn || "").indexOf("soundcloud:tracks:") === 0; symbol: "plus"; text: "В очередь"; onClicked: sc.enqueue(row.modelData) }
                        Txt { text: app.time(row.modelData.duration); color: app.muted; font.pixelSize: 11; Layout.preferredWidth: 38; horizontalAlignment: Text.AlignRight }
                    }
                }
            }
        }
    }
    component SettingSlider: RowLayout {
        property string label
        property string suffix
        property real minimum: 0
        property real maximum: 24
        property real value: 0
        signal edited(real value)
        width: Math.min(parent.width, 480); spacing: 16
        Txt { text: parent.label; Layout.preferredWidth: 110 }
        LineSlider { Layout.fillWidth: true; from: parent.minimum; to: parent.maximum; stepSize: 1; value: parent.value; onMoved: parent.edited(value) }
        Txt { text: Math.round(parent.value) + parent.suffix; Layout.preferredWidth: 60; horizontalAlignment: Text.AlignRight; color: app.muted }
    }
    component FormBlock: Column {
        property string heading
        spacing: 12
        Txt { text: parent.heading; font.pixelSize: 18; font.weight: Font.DemiBold; bottomPadding: 6 }
    }
    Component {
        id: pluginsPage
        Column {
            spacing: 18
            Row {
                spacing: 8
                Tool { text: "‹ Настройки"; onClicked: app.settingGroup = 0 }
                Tool { text: "Установить из файла…"; enabled: !!app.extensions; onClicked: pluginPicker.open() }
            }
            Txt { width: parent.width; wrapMode: Text.Wrap; visible: !!text; text: app.pluginMessage }
            Txt { visible: !app.extensions || !app.extensions.installed.length; text: "Пока нет установленных плагинов"; color: app.muted }
            Repeater {
                model: app.extensions ? app.extensions.installed : []
                FormBlock {
                    id: extensionCard
                    required property var modelData
                    width: parent.width; heading: modelData.plugin.name
                    Txt { text: extensionCard.modelData.plugin.id; color: app.muted }
                    Row {
                        spacing: 8
                        Tool { text: extensionCard.modelData.enabled ? "Отключить" : "Включить"; onClicked: app.pluginMessage = app.extensions.enable(extensionCard.modelData.plugin.id, !extensionCard.modelData.enabled) }
                        Tool { text: "Удалить"; onClicked: app.pluginMessage = app.extensions.remove(extensionCard.modelData.plugin.id) }
                    }
                    Repeater {
                        model: extensionCard.modelData.plugin.groups
                        CheckBox {
                            required property int index
                            required property var modelData
                            text: modelData.label; checked: extensionCard.modelData.flags[index]
                            onToggled: app.pluginMessage = app.extensions.configure(extensionCard.modelData.plugin.id, index, checked)
                        }
                    }
                }
            }
        }
    }
    Component {
        id: settingsPage
        Column {
            spacing: 30
            FormBlock {
                width: Math.min(parent.width, 480); heading: "Тема оформления"
                ComboBox {
                    width: parent.width; model: ["Стандартная"].concat(app.themes.map(t => t.name))
                    currentIndex: Math.max(0, app.themes.findIndex(t => t.name === prefs.themeName) + 1)
                    onActivated: index => prefs.themeName = index ? app.themes[index - 1].name : ""
                }
                Flow {
                    width: parent.width; spacing: 8
                    Tool { text: "Создать тему"; onClicked: themeEditor.begin(false) }
                    Tool { visible: !!app.chosenTheme; text: "Изменить"; onClicked: themeEditor.begin(true) }
                    Tool { visible: !!app.chosenTheme; text: "Удалить"; onClicked: {
                        const rest = app.themes.filter(t => t.name !== prefs.themeName)
                        prefs.themeName = ""; prefs.savedThemes = JSON.stringify(rest)
                    } }
                }
            }
            Tool { text: "Плагины…"; onClicked: { app.pluginMessage = ""; app.settingGroup = 1 } }
            FormBlock {
                width: Math.min(parent.width, 480); heading: "Интерфейс"
                Row { spacing: 12; Txt { text: "Вид медиатеки"; anchors.verticalCenter: parent.verticalCenter } Tool { text: "Обложки"; active: prefs.gridView; onClicked: prefs.gridView = true } Tool { text: "Список"; active: !prefs.gridView; onClicked: prefs.gridView = false } }
                Row { spacing: 12; Txt { text: "Громкость"; anchors.verticalCenter: parent.verticalCenter } VolumeSlider { width: 180 } }
                CheckBox { text: "Плавный переход между треками (3 секунды)"; checked: !!app.api.crossfade; onToggled: sc.setCrossfade(checked) }
            }
            FormBlock {
                width: parent.width; heading: "Форма и движение"
                Row { spacing: 16
                    Artwork { width: 64; height: 64; source: app.cover(app.api.current) }
                    Avatar { width: 64; height: 64; source: app.imageUrl(app.api.profile.avatar_url || "") }
                }
                SettingSlider { label: "Обложки"; suffix: " px"; maximum: 24; value: prefs.coverRadius; onEdited: v => prefs.coverRadius = v }
                SettingSlider { label: "Аватары"; suffix: " %"; maximum: 50; value: prefs.avatarRoundness; onEdited: v => prefs.avatarRoundness = v }
                SettingSlider { label: "Панели"; suffix: " px"; maximum: 24; value: prefs.panelRadius; onEdited: v => prefs.panelRadius = v }
                CheckBox { text: "Анимации и плавная прокрутка"; checked: prefs.motion; onToggled: prefs.motion = checked }
                SettingSlider { label: "Длительность"; suffix: " мс"; minimum: 120; maximum: 500; value: prefs.animationMs; enabled: prefs.motion; onEdited: v => prefs.animationMs = v }
                CheckBox { text: "Автоматически загружать ещё при прокрутке"; checked: prefs.autoLoad; onToggled: prefs.autoLoad = checked }
                Tool { text: "Сбросить оформление"; onClicked: { prefs.coverRadius = 8; prefs.avatarRoundness = 50; prefs.panelRadius = 12; prefs.animationMs = 240; prefs.motion = true; prefs.autoLoad = true } }
            }
            Rectangle { width: parent.width; height: 1; color: "#efedef" }
            FormBlock {
                width: Math.min(parent.width, 480); heading: "Аккаунт"
                Txt { text: app.api.profile.username || "SoundCloud"; font.pixelSize: 14 }
                Tool { text: "Открыть профиль SoundCloud"; onClicked: sc.openExternal(app.api.profile.permalink_url || "https://soundcloud.com") }
                Tool { text: "Выйти из аккаунта"; onClicked: disconnectDialog.open() }
            }
            Rectangle { width: parent.width; height: 1; color: "#efedef" }
            FormBlock {
                width: Math.min(parent.width, 480); heading: "SCrip"
                Txt { text: "Версия " + Qt.application.version; color: app.muted }
                Txt { text: app.api.updateAvailable ? "Доступна версия " + app.api.latestVersion : "Установлена последняя версия"; color: app.api.updateAvailable ? app.accent : app.muted }
                Tool { text: app.api.updateAvailable ? "Установить обновление" : app.api.updateChecking ? "Проверяем обновления…" : "Проверить обновления"; enabled: !app.api.updateChecking; onClicked: { sc.checkForUpdates() } }
                Txt { text: "Независимый клиент SoundCloud"; color: app.muted }
            }
        }
    }
    component BrandMark: ControlsImpl.IconImage {
        source: "assets/blob.png"
        color: app.accent
        fillMode: Image.PreserveAspectFit
        mipmap: true
    }
    component Sheet: Popup {
        id: sheet
        parent: Overlay.overlay
        anchors.centerIn: parent
        modal: true; focus: true; padding: 24
        width: Math.min(460, app.width - 60)
        closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
        background: Rectangle { color: "#fbfafa"; radius: prefs.panelRadius; border.color: "#dedadd" }
        Overlay.modal: Rectangle { color: "#28000000" }
    }
    Sheet {
        id: albumPicker
        property var track: ({})
        function begin(item) { track = item; albumTitle.text = ""; sc.clearError(); open(); sc.listDestinations() }
        Connections { target: sc; function onTrackSaved() { albumPicker.close() } }
        contentItem: ColumnLayout {
            spacing: 10
            Txt { text: "Добавить в альбом"; font.pixelSize: 20; font.weight: Font.DemiBold }
            Txt { Layout.fillWidth: true; text: albumPicker.track.title || ""; color: app.muted }
            ListView {
                id: albums
                Layout.fillWidth: true; Layout.preferredHeight: Math.min(count * 36, 216); clip: true
                model: app.api.destinations || []
                delegate: Tool { required property var modelData; width: albums.width; height: 36; text: modelData.title; enabled: !app.api.savingTrack; onClicked: sc.saveToPlaylist(albumPicker.track.urn, modelData.urn, "") }
            }
            Tool { visible: !!app.api.destinationNext; enabled: !app.api.loadingDestinations; text: "Ещё плейлисты"; onClicked: sc.listDestinations(app.api.destinationNext) }
            Field { id: albumTitle; Layout.fillWidth: true; placeholderText: "Название нового альбома" }
            Tool { text: "Создать и добавить"; enabled: !!albumTitle.text.trim() && !app.api.savingTrack; onClicked: sc.saveToPlaylist(albumPicker.track.urn, "", albumTitle.text) }
            Txt { visible: !!app.api.error; Layout.fillWidth: true; wrapMode: Text.WordWrap; text: app.api.error || ""; color: app.muted }
        }
    }
    Sheet {
        id: themeEditor
        property color draft: app.accent
        property string original: ""
        function begin(edit) {
            original = edit ? prefs.themeName : ""
            themeTitle.text = original
            draft = app.accent
            tintSlider.value = edit ? app.chosenTheme.tint : 5
            open()
            themeTitle.forceActiveFocus()
        }
        contentItem: Column {
            spacing: 14
            Txt { text: themeEditor.original ? "Изменить тему" : "Новая тема"; font.pixelSize: 20; font.weight: Font.DemiBold }
            Field { id: themeTitle; width: parent.width; maximumLength: 40; placeholderText: "Название темы"; Accessible.name: placeholderText }
            Rectangle {
                width: parent.width; height: 100; radius: 12
                color: Qt.tint("white", Qt.alpha(themeEditor.draft, tintSlider.value / 100))
                border.color: "#e6e3e5"
                BrandMark { anchors.centerIn: parent; width: 126; height: width; color: themeEditor.draft }
            }
            Tool { text: "Выбрать цвет…"; onClicked: { themeColor.selectedColor = themeEditor.draft; themeColor.open() } }
            Txt { text: "Оттенок фона · " + Math.round(tintSlider.value) + " %" }
            LineSlider { id: tintSlider; width: parent.width; from: 0; to: 20; stepSize: 1; Accessible.name: "Оттенок фона" }
            Row {
                spacing: 8
                Tool {
                    text: "Сохранить"; primary: true
                    readonly property string titleValue: themeTitle.text.trim()
                    enabled: titleValue.length > 0 && titleValue !== "Стандартная" && !app.themes.some(t => t.name === titleValue && t.name !== themeEditor.original)
                    onClicked: {
                        const entry = {name: titleValue, accent: themeEditor.draft.toString(), tint: Math.round(tintSlider.value)}
                        const next = themeEditor.original ? app.themes.map(t => t.name === themeEditor.original ? entry : t) : app.themes.concat([entry])
                        prefs.savedThemes = JSON.stringify(next); prefs.themeName = entry.name; themeEditor.close()
                    }
                }
                Tool { text: "Отмена"; onClicked: themeEditor.close() }
            }
        }
        Dialogs.ColorDialog { id: themeColor; title: "Цвет темы"; onAccepted: themeEditor.draft = selectedColor }
    }
    Sheet {
        id: playlistDialog
        contentItem: Column {
            spacing: 16
            Txt { text: "Новый плейлист"; font.pixelSize: 20; font.weight: Font.DemiBold }
            Field { id: playlistTitle; width: parent.width; placeholderText: "Название плейлиста" }
            CheckBox { id: includeCurrent; text: "Добавить текущий трек"; enabled: !!app.api.current.urn }
            Row { spacing: 8; Tool { text: "Создать"; primary: true; enabled: playlistTitle.text.trim().length > 0; onClicked: { sc.createPlaylist(playlistTitle.text, includeCurrent.checked); playlistDialog.close(); playlistTitle.clear() } } Tool { text: "Отмена"; onClicked: playlistDialog.close() } }
            Txt { text: "Плейлист будет приватным."; color: app.muted; font.pixelSize: 11 }
        }
    }
    Sheet {
        id: disconnectDialog
        contentItem: Column {
            spacing: 16
            Txt { text: "Выйти из SoundCloud?"; font.pixelSize: 19; font.weight: Font.DemiBold }
            Txt { width: parent.width; wrapMode: Text.WordWrap; elide: Text.ElideNone; text: "Доступ SCrip к аккаунту будет отозван. Ваша музыка и плейлисты останутся в SoundCloud."; color: app.muted }
            Row { spacing: 8; Tool { text: "Выйти"; primary: true; onClicked: { sc.logout(); disconnectDialog.close() } } Tool { text: "Отмена"; onClicked: disconnectDialog.close() } }
        }
    }
    Component {
        id: profileHeader
        Column {
            spacing: 24
            Rectangle {
                width: parent.width; height: 196; radius: prefs.panelRadius; color: "#f3f3f5"
                readonly property bool creator: app.displayedProfile.urn === "soundcloud:users:1675018934"
                border.width: creator ? 2 : 0; border.color: app.accent
                Rectangle {
                    visible: parent.creator; anchors.right: parent.right; anchors.top: parent.top; anchors.margins: 16
                    width: creatorLabel.implicitWidth + 22; height: 26; radius: 13; color: app.accent
                    SequentialAnimation on opacity {
                        running: parent.visible && prefs.motion; loops: Animation.Infinite
                        NumberAnimation { to: 0.7; duration: 1600 }
                        NumberAnimation { to: 1; duration: 1600 }
                    }
                    Txt { id: creatorLabel; anchors.centerIn: parent; text: "✦ Создатель SCrip"; color: app.foreground(app.accent); font.weight: Font.DemiBold }
                }
                Avatar { x: 24; y: 32; width: 96; height: 96; source: app.imageUrl(app.displayedProfile.avatar_url || "") }
                Column {
                    x: 144; y: 32; width: parent.width - 168; spacing: 8
                    Txt { width: parent.width; text: app.displayedProfile.username || "Профиль"; font.pixelSize: 28; font.weight: Font.DemiBold; font.letterSpacing: -0.6 }
                    Txt {
                        width: parent.width; color: app.accent; font.weight: Font.DemiBold
                        text: {
                            const p = app.displayedProfile
                            const products = (p.subscriptions || []).map(s => (s.product?.id || "") + " " + (s.product?.name || "")).join(" ")
                            const info = (products + " " + (p.plan || "")).toLowerCase()
                            const badges = []
                            if (/artist[ -]pro|pro[ -]unlimited|pro plus/.test(info)) badges.push("Artist Pro")
                            if (/go[ +_-]plus|go\+/.test(info)) badges.push("Go+")
                            else if (/\bgo\b/.test(info)) badges.push("Go")
                            return badges.join("  ·  ")
                        }
                        visible: !!text
                    }
                    Txt { width: parent.width; visible: !!app.displayedProfile.full_name; text: app.displayedProfile.full_name || ""; color: app.muted }
                    Txt { width: parent.width; visible: !!(app.displayedProfile.city || app.displayedProfile.country); text: [app.displayedProfile.city, app.displayedProfile.country].filter(Boolean).join(", "); color: app.muted; font.pixelSize: 12 }
                }
                Row {
                    x: 24; y: 148; spacing: 28
                    Repeater {
                        model: [{value:app.displayedProfile.followers_count || 0, caption:"подписчиков"}, {value:app.displayedProfile.followings_count || 0, caption:"подписок"}, {value:app.displayedProfile.track_count || 0, caption:"треков"}]
                        Column { required property var modelData; spacing: 3; Txt { text: modelData.value; font.pixelSize: 17; font.weight: Font.DemiBold } Txt { text: modelData.caption; font.pixelSize: 11; color: app.muted } }
                    }
                }
                Tool { anchors.right: parent.right; anchors.bottom: parent.bottom; anchors.margins: 20; symbol: "arrow"; text: "Открыть на SoundCloud"; onClicked: sc.openExternal(app.displayedProfile.permalink_url || "https://soundcloud.com") }
            }
            Txt { width: parent.width; visible: !!app.displayedProfile.description; text: app.displayedProfile.description || ""; wrapMode: Text.WordWrap; elide: Text.ElideRight; maximumLineCount: 5; lineHeight: 1.5; color: "#656569" }
            Row {
                width: parent.width; spacing: 24
                Repeater {
                    model: app.guest ? ["Треки", "Плейлисты"] : ["Треки", "Плейлисты", "Избранное", "Репосты"]
                    AbstractButton {
                        id: profileLink
                        required property string modelData
                        required property int index
                        width: profileTabLabel.implicitWidth; height: 36
                        onClicked: app.profileTab = index
                        contentItem: Txt { id: profileTabLabel; text: profileLink.modelData; color: app.profileTab === profileLink.index ? app.accent : app.muted; font.weight: Font.Medium }
                        background: Item { Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 2; radius: 1; color: app.accent; opacity: app.profileTab === profileLink.index ? 1 : 0; Behavior on opacity { NumberAnimation { duration: app.motion } } } }
                    }
                }
            }
        }
    }
    component Artwork: Canvas {
        property real radius: app.artworkRadius
        onRadiusChanged: requestPaint()
        onHeightChanged: requestPaint()
        property string source: ""
        onSourceChanged: { if (source) loadImage(source); requestPaint() }
        onAvailableChanged: if (available && source && !isImageLoaded(source)) loadImage(source)
        onImageLoaded: requestPaint()
        onWidthChanged: requestPaint()
        onPaint: {
            const c = getContext("2d"); c.reset(); c.beginPath()
            const r = Math.min(radius, width / 2, height / 2)
            c.moveTo(r,0); c.lineTo(width-r,0); c.quadraticCurveTo(width,0,width,r)
            c.lineTo(width,height-r); c.quadraticCurveTo(width,height,width-r,height)
            c.lineTo(r,height); c.quadraticCurveTo(0,height,0,height-r)
            c.lineTo(0,r); c.quadraticCurveTo(0,0,r,0); c.closePath(); c.clip()
            c.fillStyle = "#e9e7e9"; c.fillRect(0,0,width,height)
            if (source && isImageLoaded(source)) c.drawImage(source,0,0,width,height)
        }
    }
    component Avatar: Artwork { radius: Math.min(width, height) * prefs.avatarRoundness / 100 }
    component Inspector: ColumnLayout {
        id: inspector
        signal dismiss()
        spacing: 16
        RowLayout {
            Layout.fillWidth: true
            Txt { text: "Сейчас играет"; font.pixelSize: 13; font.weight: Font.DemiBold; Layout.fillWidth: true }
            Tool { symbol: "close"; text: "Скрыть панель"; onClicked: inspector.dismiss() }
        }
        Rectangle {
            visible: !!app.api.current.urn && inspector.height >= 480
            Layout.fillWidth: true; Layout.preferredHeight: Math.min(width, inspector.height * 0.34); radius: app.artworkRadius; color: "#f0eef0"; clip: true
            Glyph { anchors.centerIn: parent; width: 36; height: 36; name: "music"; ink: "#bbb4bb" }
            Artwork { anchors.fill: parent; source: app.cover(app.api.current); }
        }
        RowLayout {
            visible: !!app.api.current.urn; Layout.fillWidth: true; spacing: 8
            ColumnLayout {
                Layout.fillWidth: true; spacing: 6
                Txt { Layout.fillWidth: true; text: app.api.current.title || ""; wrapMode: Text.WordWrap; maximumLineCount: 2; font.pixelSize: 18; font.weight: Font.DemiBold; lineHeight: 1.2 }
                Txt { Layout.fillWidth: true; text: app.api.current.user?.username || "SoundCloud"; color: app.muted; font.pixelSize: 12; TapHandler { enabled: !!app.api.current.user?.urn; onTapped: app.openProfile(app.api.current.user) } }
            }
            LikeButton { track: app.api.current }
        }
        Txt { visible: !!app.api.current.genre; Layout.fillWidth: true; text: app.api.current.genre || ""; color: app.muted; font.pixelSize: 11 }
        Column {
            visible: !app.api.current.urn; Layout.fillWidth: true; spacing: 12; topPadding: 32; bottomPadding: 32
            Glyph { anchors.horizontalCenter: parent.horizontalCenter; name: "music"; width: 36; height: 36; ink: "#b5afb5" }
            Txt { width: parent.width; text: "Выберите трек"; wrapMode: Text.WordWrap; horizontalAlignment: Text.AlignHCenter; font.pixelSize: 14; font.weight: Font.Medium }
            Txt { width: parent.width; text: "Включите трек в медиатеке.
Здесь появятся обложка и очередь."; wrapMode: Text.WordWrap; horizontalAlignment: Text.AlignHCenter; color: app.muted; font.pixelSize: 12; lineHeight: 1.4 }
        }
        Rectangle { Layout.fillWidth: true; height: 1; color: "#eaeaec" }
        RowLayout { Layout.fillWidth: true; Txt { text: "Очередь"; font.weight: Font.DemiBold; Layout.fillWidth: true } Txt { text: app.api.queue.length; color: app.muted; font.pixelSize: 11 } }
        Txt { visible: app.api.queue.length === 0; text: "Добавляйте треки кнопкой +"; color: app.muted; font.pixelSize: 12 }
        ListView {
            id: queueList
            property int dragFrom: -1
            property int dragTo: -1
            onDragFromChanged: dragTo = dragFrom
            Layout.fillWidth: true; Layout.fillHeight: true; Layout.minimumHeight: 64
            clip: true; model: app.api.queue; spacing: 4
            currentIndex: app.api.queueIndex || 0
            onCurrentIndexChanged: { if (currentIndex >= 0) positionViewAtIndex(currentIndex, ListView.Contain) }
            delegate: Rectangle {
                id: queuedTrack
                required property var modelData
                required property int index
                width: Math.max(0, queueList.width - queueBar.implicitWidth - 4); height: 52; radius: 6
                color: index === app.api.queueIndex ? "#eeecef" : queueHover.hovered ? "#f1eff2" : "transparent"
                HoverHandler { id: queueHover }
                DragHandler {
                    id: queueDrag
                    target: null; xAxis.enabled: false
                    acceptedDevices: PointerDevice.Mouse
                    onActiveChanged: {
                        if (active) queueList.dragFrom = queuedTrack.index
                        else if (queueList.dragFrom === queuedTrack.index) {
                            const to = queueList.dragTo
                            queueList.dragFrom = -1
                            if (to >= 0) sc.moveQueue(queuedTrack.index, to)
                        }
                    }
                    onActiveTranslationChanged: if (active) queueList.dragTo = Math.max(0, Math.min(queueList.count - 1, queuedTrack.index + Math.round(activeTranslation.y / (queuedTrack.height + queueList.spacing))))
                }
                Rectangle {
                    visible: queueList.dragFrom >= 0 && queueList.dragTo === queuedTrack.index
                    anchors.left: parent.left; anchors.right: parent.right
                    y: queueList.dragTo > queueList.dragFrom ? parent.height - height : 0
                    height: 2; color: app.accent
                }
                RowLayout {
                    anchors.fill: parent; anchors.margins: 6; spacing: 8
                    Item {
                        width: 34; height: 34
                        Artwork { anchors.fill: parent; source: app.cover(queuedTrack.modelData); }
                        Tool { anchors.fill: parent; symbol: queuedTrack.index === app.api.queueIndex && app.api.playing ? "pause" : "play"; text: "Слушать"; onClicked: { if (queuedTrack.index === app.api.queueIndex) sc.togglePlayback(); else sc.playQueue(queuedTrack.index) } }
                    }
                    ColumnLayout {
                        Layout.fillWidth: true; spacing: 4
                        Txt { Layout.fillWidth: true; text: queuedTrack.modelData.title || "Трек"; font.pixelSize: 12 }
                        Txt { Layout.fillWidth: true; text: queuedTrack.modelData.user?.username || ""; color: app.muted; font.pixelSize: 10 }
                    }
                    Tool {
                        id: queueActions
                        symbol: "list"; text: "Порядок треков"; implicitWidth: 24
                        onClicked: orderMenu.open()
                        Menu {
                            id: orderMenu
                            MenuItem { text: "Играть следующим"; enabled: queuedTrack.index !== app.api.queueIndex; onTriggered: sc.queueNext(queuedTrack.index) }
                            MenuItem { text: "Поднять выше"; enabled: queuedTrack.index > 0; onTriggered: sc.moveQueue(queuedTrack.index, queuedTrack.index - 1) }
                            MenuItem { text: "Опустить ниже"; enabled: queuedTrack.index + 1 < queueList.count; onTriggered: sc.moveQueue(queuedTrack.index, queuedTrack.index + 1) }
                            MenuSeparator {}
                            MenuItem { text: "Удалить из очереди"; onTriggered: sc.removeQueue(queuedTrack.index) }
                        }
                    }
                }
            }
            ScrollBar.vertical: ScrollBar { id: queueBar }
        }
    }
    Popup {
        id: queuePopup; parent: Overlay.overlay
        x: app.width - width - 28; y: app.height - height - 100
        width: Math.min(340, app.width - 60); height: Math.min(640, app.height - 120)
        padding: 18; focus: true; closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
        background: Rectangle { color: "#faf8f8"; radius: 14; border.color: "#dedadd" }
        contentItem: Inspector { onDismiss: queuePopup.close() }
        enter: Transition { ParallelAnimation { NumberAnimation { property: "opacity"; from: 0; to: 1; duration: app.motion } NumberAnimation { property: "scale"; from: 0.98; to: 1; duration: app.motion; easing.type: Easing.OutCubic } } }
        exit: Transition { NumberAnimation { property: "opacity"; to: 0; duration: app.motion / 2 } }
    }

    // Нативное изменение размера без дополнительной рамки оконного менеджера.
    Repeater {
        model: [Qt.TopEdge, Qt.BottomEdge, Qt.LeftEdge, Qt.RightEdge, Qt.TopEdge|Qt.LeftEdge, Qt.TopEdge|Qt.RightEdge, Qt.BottomEdge|Qt.LeftEdge, Qt.BottomEdge|Qt.RightEdge]
        MouseArea {
            required property int modelData
            readonly property bool horizontal: (modelData & Qt.LeftEdge) || (modelData & Qt.RightEdge)
            readonly property bool vertical: (modelData & Qt.TopEdge) || (modelData & Qt.BottomEdge)
            x: (modelData & Qt.RightEdge) ? app.width - width : 0
            y: (modelData & Qt.BottomEdge) ? app.height - height : 0
            width: horizontal ? 6 : app.width; height: vertical ? 6 : app.height
            enabled: app.visibility === Window.Windowed
            cursorShape: horizontal && vertical ? ((modelData === (Qt.TopEdge|Qt.LeftEdge) || modelData === (Qt.BottomEdge|Qt.RightEdge)) ? Qt.SizeFDiagCursor : Qt.SizeBDiagCursor) : horizontal ? Qt.SizeHorCursor : Qt.SizeVerCursor
            onPressed: app.startSystemResize(modelData)
        }
    }
}
