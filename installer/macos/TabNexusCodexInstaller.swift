import AppKit
import Foundation

private let marketplaceName = "tabnexus"
private let pluginSelector = "tabnexus@tabnexus"
private let repositorySource = "KaichenCurry/TabNexus"
private let pluginURL = URL(string: "codex://plugins/tabnexus@tabnexus?source=manage")!

private struct CommandResult {
    let status: Int32
    let output: String
}

private enum InstallerError: LocalizedError {
    case codexNotFound
    case commandFailed(String)
    case verificationFailed

    var errorDescription: String? {
        switch self {
        case .codexNotFound:
            return "没有找到 Codex。请先安装或更新 Codex 桌面端，然后重试。"
        case .commandFailed(let message):
            return message.isEmpty ? "安装没有完成，请重试。" : message
        case .verificationFailed:
            return "Codex 没有返回已安装状态，请重试或更新 Codex。"
        }
    }
}

private final class CodexInstaller {
    private let environment: [String: String]
    private let version: String

    init(environment: [String: String] = ProcessInfo.processInfo.environment) {
        self.environment = environment
        self.version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
            ?? environment["TABNEXUS_INSTALLER_VERSION"]
            ?? "dev"
    }

    private func codexExecutable() throws -> String {
        if let override = environment["TABNEXUS_CODEX_CLI"], FileManager.default.isExecutableFile(atPath: override) {
            return override
        }

        let bundledCandidates = [
            "/Applications/ChatGPT.app/Contents/Resources/codex",
            "/Applications/Codex.app/Contents/Resources/codex"
        ]
        if let bundled = bundledCandidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) {
            return bundled
        }

        let path = environment["PATH"] ?? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
        for directory in path.split(separator: ":") {
            let candidate = "\(directory)/codex"
            if FileManager.default.isExecutableFile(atPath: candidate) {
                return candidate
            }
        }
        throw InstallerError.codexNotFound
    }

    @discardableResult
    private func run(_ executable: String, _ arguments: [String], allowFailure: Bool = false) throws -> CommandResult {
        let process = Process()
        let outputPipe = Pipe()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.standardOutput = outputPipe
        process.standardError = outputPipe
        process.environment = environment

        do {
            try process.run()
        } catch {
            if allowFailure {
                return CommandResult(status: 1, output: error.localizedDescription)
            }
            throw InstallerError.commandFailed(error.localizedDescription)
        }
        let data = outputPipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        let output = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if process.terminationStatus != 0 && !allowFailure {
            throw InstallerError.commandFailed(output)
        }
        return CommandResult(status: process.terminationStatus, output: output)
    }

    func install(progress: (String) -> Void) throws -> String {
        let codex = try codexExecutable()
        let source = environment["TABNEXUS_MARKETPLACE_SOURCE"] ?? repositorySource
        let isLocalSource = source.hasPrefix("/") || source.hasPrefix("./") || source.hasPrefix("../")

        progress("正在检查已有版本…")
        try run(codex, ["plugin", "remove", pluginSelector, "--json"], allowFailure: true)
        try run(codex, ["plugin", "marketplace", "remove", marketplaceName, "--json"], allowFailure: true)

        progress("正在添加 TabNexus 插件源…")
        var marketplaceArguments = ["plugin", "marketplace", "add", source]
        if !isLocalSource && version != "dev" {
            marketplaceArguments += ["--ref", "v\(version)"]
        }
        marketplaceArguments.append("--json")
        try run(codex, marketplaceArguments)

        progress("正在安装到 Codex…")
        try run(codex, ["plugin", "add", pluginSelector, "--json"])

        progress("正在确认安装结果…")
        let list = try run(codex, ["plugin", "list", "--json"]).output
        guard let data = list.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let installed = root["installed"] as? [[String: Any]],
              installed.contains(where: {
                  ($0["pluginId"] as? String) == pluginSelector
                      && ($0["installed"] as? Bool) == true
                      && ($0["enabled"] as? Bool) == true
              }) else {
            throw InstallerError.verificationFailed
        }
        return codex
    }
}

private final class InstallerViewController: NSViewController {
    private let installer = CodexInstaller()
    private let statusLabel = NSTextField(labelWithString: "准备就绪")
    private let detailLabel = NSTextField(wrappingLabelWithString: "自动添加 TabNexus Marketplace 并安装插件。整个过程不需要终端，也不会读取你的工作区内容。")
    private let installButton = NSButton(title: "安装到 Codex", target: nil, action: nil)
    private let openButton = NSButton(title: "在 Codex 中打开", target: nil, action: nil)
    private let spinner = NSProgressIndicator()

    override func loadView() {
        view = NSView(frame: NSRect(x: 0, y: 0, width: 560, height: 410))
        view.wantsLayer = true
        view.layer?.backgroundColor = NSColor(calibratedWhite: 0.98, alpha: 1).cgColor

        let icon = NSImageView()
        icon.image = NSApplication.shared.applicationIconImage
        icon.imageScaling = .scaleProportionallyUpOrDown
        icon.translatesAutoresizingMaskIntoConstraints = false

        let eyebrow = NSTextField(labelWithString: "TABNEXUS · CODEX")
        eyebrow.font = .systemFont(ofSize: 11, weight: .semibold)
        eyebrow.textColor = NSColor(calibratedRed: 0.31, green: 0.40, blue: 0.68, alpha: 1)
        eyebrow.translatesAutoresizingMaskIntoConstraints = false

        let title = NSTextField(labelWithString: "把 TabNexus 添加到 Codex")
        title.font = .systemFont(ofSize: 27, weight: .bold)
        title.textColor = NSColor(calibratedRed: 0.12, green: 0.16, blue: 0.25, alpha: 1)
        title.translatesAutoresizingMaskIntoConstraints = false

        let subtitle = NSTextField(wrappingLabelWithString: "安装一次，以后 Codex 就能直接读取和管理你的 TabNexus 工作区。")
        subtitle.font = .systemFont(ofSize: 15)
        subtitle.textColor = NSColor(calibratedWhite: 0.42, alpha: 1)
        subtitle.translatesAutoresizingMaskIntoConstraints = false

        let card = NSView()
        card.wantsLayer = true
        card.layer?.backgroundColor = NSColor.white.cgColor
        card.layer?.cornerRadius = 15
        card.layer?.borderWidth = 1
        card.layer?.borderColor = NSColor(calibratedRed: 0.86, green: 0.88, blue: 0.93, alpha: 1).cgColor
        card.translatesAutoresizingMaskIntoConstraints = false

        statusLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        statusLabel.textColor = NSColor(calibratedRed: 0.14, green: 0.19, blue: 0.29, alpha: 1)
        statusLabel.translatesAutoresizingMaskIntoConstraints = false

        detailLabel.font = .systemFont(ofSize: 12.5)
        detailLabel.textColor = NSColor(calibratedWhite: 0.43, alpha: 1)
        detailLabel.maximumNumberOfLines = 3
        detailLabel.translatesAutoresizingMaskIntoConstraints = false

        spinner.style = .spinning
        spinner.controlSize = .small
        spinner.isHidden = true
        spinner.translatesAutoresizingMaskIntoConstraints = false

        installButton.bezelStyle = .rounded
        installButton.keyEquivalent = "\r"
        installButton.target = self
        installButton.action = #selector(startInstall)
        installButton.translatesAutoresizingMaskIntoConstraints = false

        openButton.bezelStyle = .rounded
        openButton.target = self
        openButton.action = #selector(openCodex)
        openButton.isHidden = true
        openButton.translatesAutoresizingMaskIntoConstraints = false

        let privacy = NSTextField(labelWithString: "🔒 本地安装 · 不读取模型密钥 · 不上传工作区")
        privacy.font = .systemFont(ofSize: 11)
        privacy.textColor = NSColor(calibratedRed: 0.31, green: 0.49, blue: 0.38, alpha: 1)
        privacy.translatesAutoresizingMaskIntoConstraints = false

        [icon, eyebrow, title, subtitle, card, privacy].forEach(view.addSubview)
        [statusLabel, detailLabel, spinner, installButton, openButton].forEach(card.addSubview)

        NSLayoutConstraint.activate([
            icon.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 40),
            icon.topAnchor.constraint(equalTo: view.topAnchor, constant: 38),
            icon.widthAnchor.constraint(equalToConstant: 58),
            icon.heightAnchor.constraint(equalToConstant: 58),

            eyebrow.leadingAnchor.constraint(equalTo: icon.trailingAnchor, constant: 18),
            eyebrow.topAnchor.constraint(equalTo: icon.topAnchor, constant: 3),
            title.leadingAnchor.constraint(equalTo: eyebrow.leadingAnchor),
            title.topAnchor.constraint(equalTo: eyebrow.bottomAnchor, constant: 5),
            title.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -34),

            subtitle.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 40),
            subtitle.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -40),
            subtitle.topAnchor.constraint(equalTo: icon.bottomAnchor, constant: 20),

            card.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 40),
            card.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -40),
            card.topAnchor.constraint(equalTo: subtitle.bottomAnchor, constant: 24),
            card.heightAnchor.constraint(equalToConstant: 154),

            spinner.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 22),
            spinner.topAnchor.constraint(equalTo: card.topAnchor, constant: 25),
            statusLabel.leadingAnchor.constraint(equalTo: spinner.trailingAnchor, constant: 10),
            statusLabel.centerYAnchor.constraint(equalTo: spinner.centerYAnchor),
            statusLabel.trailingAnchor.constraint(lessThanOrEqualTo: card.trailingAnchor, constant: -20),

            detailLabel.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 22),
            detailLabel.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -22),
            detailLabel.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 12),

            installButton.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),
            installButton.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -18),
            installButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 128),
            openButton.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),
            openButton.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -18),
            openButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 142),

            privacy.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 42),
            privacy.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -31)
        ])
    }

    @objc private func startInstall() {
        installButton.isEnabled = false
        installButton.title = "正在安装…"
        openButton.isHidden = true
        spinner.isHidden = false
        spinner.startAnimation(nil)
        detailLabel.stringValue = "请保持此窗口打开，通常只需要几秒钟。"

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            do {
                _ = try installer.install { message in
                    DispatchQueue.main.async { self.statusLabel.stringValue = message }
                }
                DispatchQueue.main.async {
                    self.spinner.stopAnimation(nil)
                    self.spinner.isHidden = true
                    self.statusLabel.stringValue = "TabNexus 已安装"
                    self.statusLabel.textColor = NSColor(calibratedRed: 0.18, green: 0.48, blue: 0.31, alpha: 1)
                    self.detailLabel.stringValue = "插件已经出现在 Codex 的 Plugins 中。现在可以直接打开。"
                    self.installButton.isHidden = true
                    self.openButton.isHidden = false
                }
            } catch {
                DispatchQueue.main.async {
                    self.spinner.stopAnimation(nil)
                    self.spinner.isHidden = true
                    self.statusLabel.stringValue = "安装未完成"
                    self.statusLabel.textColor = NSColor(calibratedRed: 0.70, green: 0.25, blue: 0.20, alpha: 1)
                    self.detailLabel.stringValue = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                    self.installButton.title = "重试"
                    self.installButton.isEnabled = true
                }
            }
        }
    }

    @objc private func openCodex() {
        NSWorkspace.shared.open(pluginURL)
    }
}

private final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let controller = InstallerViewController()
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 560, height: 410),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        window.title = "TabNexus Codex 安装器"
        window.contentViewController = controller
        window.center()
        window.isReleasedWhenClosed = false
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
        self.window = window
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}

if CommandLine.arguments.contains("--headless") {
    do {
        let executable = try CodexInstaller().install { message in
            FileHandle.standardError.write(Data("\(message)\n".utf8))
        }
        let response = ["ok": true, "codex": executable] as [String: Any]
        let data = try JSONSerialization.data(withJSONObject: response, options: [.sortedKeys])
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
        exit(EXIT_SUCCESS)
    } catch {
        let response = ["ok": false, "error": (error as? LocalizedError)?.errorDescription ?? error.localizedDescription] as [String: Any]
        let data = try JSONSerialization.data(withJSONObject: response, options: [.sortedKeys])
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
        exit(EXIT_FAILURE)
    }
} else {
    let app = NSApplication.shared
    app.setActivationPolicy(.regular)
    let delegate = AppDelegate()
    app.delegate = delegate
    app.run()
}
