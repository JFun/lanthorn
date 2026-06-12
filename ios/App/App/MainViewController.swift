import UIKit
import Capacitor

/// App's bridge VC: registers the local NativeFX plugin and keeps the game
/// full-screen friendly (hidden home indicator, deliberate bottom-edge swipe
/// since the piece tray sits near the screen edge).
class MainViewController: CAPBridgeViewController {

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeFXPlugin())
    }

    // (prefersHomeIndicatorAutoHidden is sealed non-open by CAPBridgeViewController)
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { [.bottom] }
}
