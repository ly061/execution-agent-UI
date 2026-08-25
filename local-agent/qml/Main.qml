import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    id: window
    width: 1180
    height: 760
    minimumWidth: 900
    minimumHeight: 620
    visible: true
    title: "QA Orbit Agent"
    color: "#f5f7fb"
    property int currentPage: 0

    font.family: Qt.platform.os === "osx" ? "SF Pro Display" : "Segoe UI"

    RowLayout {
        anchors.fill: parent
        spacing: 0

        Rectangle {
            Layout.preferredWidth: 244
            Layout.fillHeight: true
            color: "#111b2b"

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 24
                spacing: 10

                RowLayout {
                    Layout.fillWidth: true
                    Layout.bottomMargin: 28
                    Rectangle {
                        width: 44; height: 44; radius: 13
                        gradient: Gradient {
                            GradientStop { position: 0; color: "#ed174f" }
                            GradientStop { position: 1; color: "#9f1239" }
                        }
                        Text { anchors.centerIn: parent; text: "Q"; color: "white"; font.pixelSize: 22; font.bold: true }
                    }
                    ColumnLayout {
                        spacing: 1
                        Text { text: "QA Orbit"; color: "white"; font.pixelSize: 19; font.bold: true }
                        Text { text: "Local Agent"; color: "#94a3b8"; font.pixelSize: 12 }
                    }
                }

                Repeater {
                    model: ["Runs", "Connection"]
                    delegate: Button {
                        required property int index
                        required property string modelData
                        Layout.fillWidth: true
                        height: 48
                        text: (index === 0 ? "●   " : "◆   ") + modelData
                        onClicked: window.currentPage = index
                        contentItem: Text {
                            text: parent.text
                            color: window.currentPage === index ? "white" : "#b8c3d4"
                            font.pixelSize: 15
                            font.bold: window.currentPage === index
                            verticalAlignment: Text.AlignVCenter
                            leftPadding: 13
                        }
                        background: Rectangle {
                            radius: 10
                            color: window.currentPage === index ? "#d90f46" : "transparent"
                        }
                    }
                }

                Item { Layout.fillHeight: true }

                Rectangle {
                    Layout.fillWidth: true
                    height: 74
                    radius: 12
                    color: "#1b293c"
                    RowLayout {
                        anchors.fill: parent; anchors.margins: 14
                        Rectangle {
                            width: 10; height: 10; radius: 5
                            color: ["online", "busy"].includes(backend.connectionState) ? "#35c98b" : backend.connectionState === "connecting" ? "#f7b84b" : "#64748b"
                        }
                        ColumnLayout {
                            Layout.fillWidth: true; spacing: 2
                            Text { text: backend.deviceName; color: "white"; font.bold: true; elide: Text.ElideRight; Layout.fillWidth: true }
                            Text { text: backend.connectionState; color: "#94a3b8"; font.pixelSize: 12 }
                        }
                    }
                }
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            color: "#f5f7fb"

            ColumnLayout {
                anchors.fill: parent
                spacing: 0

                Rectangle {
                    Layout.fillWidth: true
                    height: 84
                    color: "white"
                    border.color: "#e5e9f0"
                    RowLayout {
                        anchors.fill: parent; anchors.leftMargin: 34; anchors.rightMargin: 34
                        ColumnLayout {
                            spacing: 2
                            Text { text: window.currentPage === 0 ? "Runs" : "Server connection"; color: "#172333"; font.pixelSize: 25; font.bold: true }
                            Text { text: window.currentPage === 0 ? "Run Plans assigned by the Execution Agent Server" : "Authenticate this device with a Server API Key"; color: "#768398"; font.pixelSize: 13 }
                        }
                        Item { Layout.fillWidth: true }
                        Rectangle {
                            implicitWidth: statusText.implicitWidth + 30; height: 34; radius: 17
                            color: ["online", "busy"].includes(backend.connectionState) ? "#e8f8f1" : "#edf0f5"
                            Text {
                                id: statusText; anchors.centerIn: parent
                                text: backend.connectionState.toUpperCase()
                                color: ["online", "busy"].includes(backend.connectionState) ? "#16845b" : "#667085"
                                font.pixelSize: 11; font.bold: true
                            }
                        }
                    }
                }

                StackLayout {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    currentIndex: window.currentPage

                    Item {
                        ColumnLayout {
                            anchors.fill: parent; anchors.margins: 30; spacing: 18
                            Rectangle {
                                Layout.fillWidth: true; height: 88; radius: 14; color: "white"; border.color: "#e2e7ef"
                                RowLayout {
                                    anchors.fill: parent; anchors.margins: 20
                                    Rectangle {
                                        width: 46; height: 46; radius: 14
                                        color: backend.connectionState === "busy" ? "#fff0f3" : "#eef3f8"
                                        Text { anchors.centerIn: parent; text: backend.connectionState === "busy" ? "▶" : "⌁"; color: backend.connectionState === "busy" ? "#d90f46" : "#506176"; font.pixelSize: 20 }
                                    }
                                    ColumnLayout {
                                        Layout.fillWidth: true; spacing: 3
                                        Text { text: backend.connectionState === "busy" ? "Executing Run Plan" : "Execution Agent Server"; color: "#1e293b"; font.pixelSize: 16; font.bold: true }
                                        Text { text: backend.connectionMessage; color: "#718096"; font.pixelSize: 13; elide: Text.ElideRight; Layout.fillWidth: true }
                                    }
                                    Button { text: "Connection"; onClicked: window.currentPage = 1 }
                                }
                            }

                            Text { text: "Recent runs"; color: "#1e293b"; font.pixelSize: 17; font.bold: true }
                            ListView {
                                Layout.fillWidth: true; Layout.fillHeight: true
                                spacing: 10
                                clip: true
                                model: backend.taskModel
                                delegate: Rectangle {
                                    required property string taskId
                                    required property string title
                                    required property string status
                                    required property string updatedAt
                                    required property string lastLog
                                    required property string runPlanId
                                    width: ListView.view.width; height: 92; radius: 12
                                    color: "white"; border.color: "#e1e6ee"
                                    RowLayout {
                                        anchors.fill: parent; anchors.margins: 17; spacing: 15
                                        Rectangle {
                                            width: 11; height: 11; radius: 6
                                            color: status === "completed" ? "#25a875" : status === "failed" ? "#e33d5f" : status === "running" ? "#3b82f6" : "#94a3b8"
                                        }
                                        ColumnLayout {
                                            Layout.fillWidth: true; spacing: 4
                                            Text { text: title; color: "#1f2937"; font.pixelSize: 15; font.bold: true; elide: Text.ElideRight; Layout.fillWidth: true }
                                            Text { text: (runPlanId || taskId).slice(0, 16) + "  ·  " + lastLog; color: "#748094"; font.pixelSize: 12; elide: Text.ElideRight; Layout.fillWidth: true }
                                        }
                                        Rectangle {
                                            implicitWidth: taskStatus.implicitWidth + 24; height: 30; radius: 15
                                            color: status === "completed" ? "#e9f8f2" : status === "failed" ? "#fff0f3" : "#edf3ff"
                                            Text { id: taskStatus; anchors.centerIn: parent; text: status.toUpperCase(); color: status === "completed" ? "#17825b" : status === "failed" ? "#c92d4e" : "#3569b8"; font.pixelSize: 10; font.bold: true }
                                        }
                                    }
                                }
                                footer: Item { width: 1; height: 8 }
                            }
                        }
                    }

                    Item {
                        Flickable {
                            anchors.fill: parent; contentHeight: connectionCard.height + 60; clip: true
                            Rectangle {
                                id: connectionCard
                                x: 30; y: 30; width: Math.min(parent.width - 60, 720); height: 480; radius: 15
                                color: "white"; border.color: "#e1e6ee"
                                ColumnLayout {
                                    anchors.fill: parent; anchors.margins: 28; spacing: 12
                                    Text { text: "Connect Local Agent"; color: "#172333"; font.pixelSize: 21; font.bold: true }
                                    Text { text: "Use an Agent API Key created by the Execution Agent Server. The key is stored in the operating system keychain."; color: "#718096"; font.pixelSize: 13; wrapMode: Text.WordWrap; Layout.fillWidth: true }

                                    Text { text: "SERVER URL"; color: "#667085"; font.pixelSize: 11; font.bold: true; Layout.topMargin: 12 }
                                    TextField { id: serverUrl; Layout.fillWidth: true; text: backend.serverUrl; placeholderText: "http://127.0.0.1:8000" }
                                    Text { text: "AGENT API KEY"; color: "#667085"; font.pixelSize: 11; font.bold: true }
                                    TextField { id: apiKey; Layout.fillWidth: true; text: backend.apiKey; echoMode: TextInput.Password; placeholderText: "qao_agent_…" }
                                    Text { text: "DEVICE NAME"; color: "#667085"; font.pixelSize: 11; font.bold: true }
                                    TextField { id: deviceName; Layout.fillWidth: true; text: backend.deviceName }

                                    RowLayout {
                                        Layout.fillWidth: true; Layout.topMargin: 10
                                        Button { text: "Disconnect"; enabled: backend.connectionState !== "offline"; onClicked: backend.disconnectAgent() }
                                        Item { Layout.fillWidth: true }
                                        Button {
                                            text: backend.connectionState === "connecting" ? "Connecting…" : "Connect Agent"
                                            enabled: backend.connectionState !== "connecting"
                                            onClicked: backend.connectAgent(serverUrl.text, apiKey.text, deviceName.text)
                                        }
                                    }
                                    Rectangle {
                                        Layout.fillWidth: true; height: 56; radius: 9
                                        color: backend.connectionState === "error" ? "#fff1f3" : "#f3f6fa"
                                        Text { anchors.fill: parent; anchors.margins: 14; text: backend.connectionMessage; color: backend.connectionState === "error" ? "#bd2846" : "#5f6d80"; verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
