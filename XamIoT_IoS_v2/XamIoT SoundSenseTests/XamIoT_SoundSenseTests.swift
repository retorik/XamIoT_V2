import Testing
import SwiftData
@testable import XamIoT_SoundSense

// MARK: - ESPDevice sound history

@Suite("ESPDevice — soundHistory")
struct ESPDeviceSoundHistoryTests {

    private func makeDevice() -> ESPDevice {
        ESPDevice(id: "test-1", espUID: "AA:BB:CC", name: "Test", topicPrefix: "v2/test", lastSeen: nil)
    }

    @Test("should decode empty JSON as empty array")
    func decodesEmptyJSON() {
        let dev = makeDevice()
        #expect(dev.soundHistory.isEmpty)
    }

    @Test("should append sample and expose it via soundHistory")
    func appendOneSample() {
        let dev = makeDevice()
        dev.appendSoundSample(42.0)
        #expect(dev.soundHistory == [42.0])
    }

    @Test("should keep samples in insertion order")
    func preservesOrder() {
        let dev = makeDevice()
        [10.0, 20.0, 30.0].forEach { dev.appendSoundSample($0) }
        #expect(dev.soundHistory == [10.0, 20.0, 30.0])
    }

    @Test("should cap rolling buffer at 30 entries")
    func rollingBufferCappedAt30() {
        let dev = makeDevice()
        for i in 0..<35 { dev.appendSoundSample(Double(i)) }
        let history = dev.soundHistory
        #expect(history.count == 30)
        // Les 30 dernières valeurs : 5..34
        #expect(history.first == 5.0)
        #expect(history.last  == 34.0)
    }

    @Test("should keep exactly 30 entries after exactly 30 appends")
    func exactlyThirtySamples() {
        let dev = makeDevice()
        for i in 0..<30 { dev.appendSoundSample(Double(i)) }
        #expect(dev.soundHistory.count == 30)
    }

    @Test("should accept boundary values 0.0 and 100.0")
    func boundaryValues() {
        let dev = makeDevice()
        dev.appendSoundSample(0.0)
        dev.appendSoundSample(100.0)
        #expect(dev.soundHistory == [0.0, 100.0])
    }

    @Test("should survive malformed soundHistoryJSON without crashing")
    func malformedJSONReturnsEmpty() {
        let dev = makeDevice()
        dev.soundHistoryJSON = "not json at all"
        #expect(dev.soundHistory.isEmpty)
    }

    @Test("should survive partial append when existing JSON is corrupt")
    func appendAfterCorruptJSON() {
        let dev = makeDevice()
        dev.soundHistoryJSON = "not json"
        dev.appendSoundSample(55.0)
        // appendSoundSample uses soundHistoryJSON as fallback on encode failure,
        // but soundHistory() for empty corrupt JSON → [] → append gives [55.0]
        #expect(dev.soundHistory == [55.0])
    }
}

// MARK: - DeviceDraft validation

@Suite("DeviceDraft — isValid")
struct DeviceDraftValidationTests {

    @Test("should be invalid when esp_uid is empty")
    func invalidWhenUIDEmpty() {
        let draft = DeviceDraft(id: nil, esp_uid: "", name: "Salon", topic_prefix: "v2/x", mqtt_password: nil)
        #expect(!draft.isValid)
    }

    @Test("should be invalid when name is empty")
    func invalidWhenNameEmpty() {
        let draft = DeviceDraft(id: nil, esp_uid: "AA:BB:CC", name: "", topic_prefix: "v2/x", mqtt_password: nil)
        #expect(!draft.isValid)
    }

    @Test("should be invalid when both fields are empty")
    func invalidWhenBothEmpty() {
        #expect(!DeviceDraft.empty.isValid)
    }

    @Test("should be invalid when esp_uid is only whitespace")
    func invalidWhenUIDWhitespace() {
        let draft = DeviceDraft(id: nil, esp_uid: "   ", name: "Salon", topic_prefix: "v2/x", mqtt_password: nil)
        #expect(!draft.isValid)
    }

    @Test("should be invalid when name is only whitespace")
    func invalidWhenNameWhitespace() {
        let draft = DeviceDraft(id: nil, esp_uid: "AA:BB", name: "\t  \n", topic_prefix: "v2/x", mqtt_password: nil)
        #expect(!draft.isValid)
    }

    @Test("should be valid when uid and name are non-empty")
    func validWhenBothFilled() {
        let draft = DeviceDraft(id: nil, esp_uid: "AA:BB:CC", name: "Salon", topic_prefix: "v2/x", mqtt_password: nil)
        #expect(draft.isValid)
    }

    @Test("should be valid even when topic_prefix is empty — it is hidden from UI")
    func validWithEmptyTopicPrefix() {
        let draft = DeviceDraft(id: nil, esp_uid: "AA:BB:CC", name: "Salon", topic_prefix: "", mqtt_password: nil)
        #expect(draft.isValid)
    }

    @Test("should be valid regardless of mqtt_password presence")
    func validWithOrWithoutPassword() {
        let withPass    = DeviceDraft(id: nil, esp_uid: "uid", name: "Nom", topic_prefix: "v2/t", mqtt_password: "secret")
        let withoutPass = DeviceDraft(id: nil, esp_uid: "uid", name: "Nom", topic_prefix: "v2/t", mqtt_password: nil)
        #expect(withPass.isValid)
        #expect(withoutPass.isValid)
    }
}

// MARK: - generateRandomMQTTPass

@Suite("generateRandomMQTTPass")
struct MQTTPasswordGeneratorTests {

    @Test("should return password of requested length (default 32)")
    func defaultLength() {
        let pass = generateRandomMQTTPass()
        #expect(pass.count == 32)
    }

    @Test("should return password of custom length")
    func customLength() {
        #expect(generateRandomMQTTPass(length: 16).count == 16)
        #expect(generateRandomMQTTPass(length: 64).count == 64)
    }

    @Test("should only contain characters from the allowed set")
    func onlyAllowedChars() {
        let allowed = Set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}.,:?")
        let pass = generateRandomMQTTPass(length: 200)
        #expect(pass.allSatisfy { allowed.contains($0) })
    }

    @Test("should produce different values on successive calls (probabilistic)")
    func differentOnEachCall() {
        let a = generateRandomMQTTPass()
        let b = generateRandomMQTTPass()
        // Probabilité de collision : (1/87)^32 ≈ 0 — on accepte ce test
        #expect(a != b)
    }
}

// MARK: - DeviceDraft Equatable

@Suite("DeviceDraft — Equatable")
struct DeviceDraftEquatableTests {

    @Test("should be equal when all fields match")
    func equalWhenSame() {
        let a = DeviceDraft(id: "1", esp_uid: "uid", name: "n", topic_prefix: "t", mqtt_password: "p")
        let b = DeviceDraft(id: "1", esp_uid: "uid", name: "n", topic_prefix: "t", mqtt_password: "p")
        #expect(a == b)
    }

    @Test("should differ when any field changes")
    func notEqualWhenNameDiffers() {
        let a = DeviceDraft(id: "1", esp_uid: "uid", name: "A", topic_prefix: "t", mqtt_password: nil)
        let b = DeviceDraft(id: "1", esp_uid: "uid", name: "B", topic_prefix: "t", mqtt_password: nil)
        #expect(a != b)
    }
}
