'use client';

import React, { useState, useEffect, useRef } from 'react';
import { VoiceConversationStateMachine, StateMachineOutput } from '../state-machine';
import { MockDisposableStateStore, FIXED_SYNTHETIC_TASK } from '../mock-tools';
import { SyntheticVoicePipelineRunner, checkVoiceProviderConfiguration, LatencyReport } from '../livekit-pipeline-adapter';
import { ConversationState, LanguageTarget, ConversationTurn } from '../types';

export function VoiceStaffHarness() {
  const [store] = useState(() => new MockDisposableStateStore());
  const [stateMachine, setStateMachine] = useState<VoiceConversationStateMachine | null>(null);
  const [pipelineRunner, setPipelineRunner] = useState<SyntheticVoicePipelineRunner | null>(null);

  const [sessionActive, setSessionActive] = useState<boolean>(false);
  const [micActive, setMicActive] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [currentState, setCurrentState] = useState<ConversationState>('IDLE');
  const [currentLanguage, setCurrentLanguage] = useState<LanguageTarget>('en');
  const [turns, setTurns] = useState<readonly ConversationTurn[]>([]);
  const [sessionDuration, setSessionDuration] = useState<number>(0);
  const [latestLatency, setLatestLatency] = useState<LatencyReport | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Ready for staff evaluation');
  const [userInputText, setUserInputText] = useState<string>('');

  const configStatus = checkVoiceProviderConfiguration();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up timer and media resources on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pipelineRunner) {
        pipelineRunner.stopMicrophone();
      }
    };
  }, [pipelineRunner]);

  // Session duration timer
  useEffect(() => {
    if (sessionActive && stateMachine) {
      timerRef.current = setInterval(() => {
        const dur = stateMachine.getSessionDuration();
        setSessionDuration(dur);
        if (dur >= 180) {
          handleEmergencyStop('Max duration ceiling reached (180s)');
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionActive, stateMachine]);

  const handleStartSession = (lang: LanguageTarget) => {
    store.clear();
    const sm = new VoiceConversationStateMachine(store, { defaultLanguage: lang });
    const runner = new SyntheticVoicePipelineRunner(sm, store);

    setStateMachine(sm);
    setPipelineRunner(runner);

    const micRes = runner.startMicrophone();
    setMicActive(micRes.success);
    setIsMuted(false);

    const greeting = sm.startSession(lang);
    setCurrentState(greeting.state);
    setCurrentLanguage(greeting.language);
    setTurns(sm.getTurns());
    setSessionActive(true);
    setStatusMessage(`Session active (${lang.toUpperCase()}). Microphone listening.`);
  };

  const handleEmergencyStop = (reason: string = 'Staff terminated session') => {
    if (stateMachine && sessionActive) {
      stateMachine.terminateSession('COMPLETED', 'Session ended by staff operator.', reason);
      setCurrentState(stateMachine.getState());
      setTurns(stateMachine.getTurns());
    }
    if (pipelineRunner) {
      pipelineRunner.stopMicrophone();
    }
    setSessionActive(false);
    setMicActive(false);
    setStatusMessage(`Session terminated: ${reason}`);
  };

  const handleToggleMute = () => {
    if (!pipelineRunner) return;
    const newMute = !isMuted;
    pipelineRunner.setMute(newMute);
    setIsMuted(newMute);
    setStatusMessage(newMute ? 'Microphone muted' : 'Microphone active');
  };

  const handleSimulateUtterance = async (text: string) => {
    if (!pipelineRunner || !stateMachine || !sessionActive) return;
    try {
      setStatusMessage('Processing speech input...');
      const res = await pipelineRunner.simulateTurn(text);
      setCurrentState(res.output.state);
      setCurrentLanguage(res.output.language);
      setLatestLatency(res.latencies);
      setTurns(stateMachine.getTurns());
      setUserInputText('');

      if (res.output.shouldTerminate) {
        setSessionActive(false);
        setMicActive(false);
        pipelineRunner.stopMicrophone();
        setStatusMessage(`Session finished: ${res.output.terminationReason || 'Completed'}`);
      } else {
        setStatusMessage('Assistant responded. Awaiting next turn.');
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err?.message || 'Processing failed'}`);
    }
  };

  const handleBargeIn = () => {
    if (!pipelineRunner || !stateMachine) return;
    const res = pipelineRunner.triggerBargeIn();
    setTurns(stateMachine.getTurns());
    setStatusMessage(res.message);
  };

  const handleSilenceTimeout = () => {
    if (!pipelineRunner || !stateMachine) return;
    const out = pipelineRunner.triggerSilence();
    setCurrentState(out.state);
    setTurns(stateMachine.getTurns());
    if (out.shouldTerminate) {
      setSessionActive(false);
      setMicActive(false);
      pipelineRunner.stopMicrophone();
    }
    setStatusMessage(`Silence detected: ${out.shouldTerminate ? 'Call ended' : 'Re-prompted user'}`);
  };

  const handleUnclearSpeech = () => {
    if (!pipelineRunner || !stateMachine) return;
    const out = pipelineRunner.triggerUnclearSpeech();
    setCurrentState(out.state);
    setTurns(stateMachine.getTurns());
    setStatusMessage('Unclear speech: Prompted for clarification.');
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6 bg-slate-50 text-slate-900 rounded-xl shadow-lg border border-slate-200">
      {/* Strict Boundary Alert Banner */}
      <div className="bg-amber-100 border-l-4 border-amber-600 p-4 rounded-r shadow-sm">
        <div className="flex items-start">
          <div className="flex-1">
            <h3 className="text-sm font-bold text-amber-900 tracking-wide uppercase">
              Staff Test Harness Only — Synthetic Data — Real Calls Prohibited
            </h3>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
              This is a sandboxed staff evaluation environment. No telephone trunks are connected,
              audio is <strong>NOT recorded</strong> by default, and no real beneficiary data is accessed.
            </p>
            <div className="mt-2 text-xs font-mono bg-amber-200/60 px-2 py-1 rounded inline-block text-amber-950">
              Provider Mode: {configStatus.statusDescription}
            </div>
          </div>
        </div>
      </div>

      {/* Main Control Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Session Status & Config */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-slate-800 border-b pb-2">Session Telemetry</h2>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Status:</span>
              <span className={`font-semibold ${sessionActive ? 'text-emerald-600' : 'text-slate-600'}`}>
                {sessionActive ? '● ACTIVE CALL' : '○ IDLE'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Conversation State:</span>
              <span className="font-mono text-blue-700 font-semibold">{currentState}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Active Language:</span>
              <span className="font-semibold uppercase text-slate-700">{currentLanguage}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Microphone:</span>
              <span className={`font-semibold ${isMuted ? 'text-amber-600' : micActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                {isMuted ? 'MUTED' : micActive ? 'LIVE' : 'OFF'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Duration / Ceiling:</span>
              <span className="font-mono">{sessionDuration}s / 180s</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Turns Count:</span>
              <span className="font-mono">{turns.length} / 15 max</span>
            </div>
          </div>

          {/* Start Actions */}
          {!sessionActive ? (
            <div className="pt-2 space-y-2">
              <p className="text-xs font-medium text-slate-600">Start Synthetic Session in:</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleStartSession('en')}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition"
                >
                  English
                </button>
                <button
                  onClick={() => handleStartSession('hi')}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded transition"
                >
                  Hindi
                </button>
                <button
                  onClick={() => handleStartSession('hinglish')}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded transition"
                >
                  Hinglish
                </button>
              </div>
            </div>
          ) : (
            <div className="pt-2 space-y-2">
              <button
                onClick={handleToggleMute}
                className={`w-full py-2 text-xs font-medium rounded border transition ${
                  isMuted ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-slate-100 border-slate-300 text-slate-700'
                }`}
              >
                {isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
              </button>
              <button
                onClick={() => handleEmergencyStop('Staff manual stop')}
                className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded shadow transition"
              >
                Emergency Hang Up
              </button>
            </div>
          )}
        </div>

        {/* Middle Column: Fixed Synthetic Task & Live Controls */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-slate-800 border-b pb-2">Synthetic Task Context</h2>
          <div className="bg-slate-50 p-3 rounded text-xs space-y-1.5 border border-slate-200">
            <div>
              <span className="font-semibold text-slate-600">Task ID:</span>{' '}
              <span className="font-mono text-slate-900">{FIXED_SYNTHETIC_TASK.taskId}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-600">Caregiver (Mock):</span>{' '}
              <span className="text-slate-900">{FIXED_SYNTHETIC_TASK.mockCaregiverName}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-600">Child (Mock Initials):</span>{' '}
              <span className="text-slate-900">{FIXED_SYNTHETIC_TASK.mockChildInitials}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-600">Context:</span>{' '}
              <span className="text-slate-700">{FIXED_SYNTHETIC_TASK.programmeContext}</span>
            </div>
            <div className="pt-1">
              <span className="font-semibold text-slate-600">Follow-up Task:</span>
              <p className="text-slate-700 mt-0.5">{FIXED_SYNTHETIC_TASK.taskDescription}</p>
            </div>
          </div>

          {sessionActive && (
            <div className="space-y-3 pt-2">
              <label className="text-xs font-semibold text-slate-700">Simulate Staff Speech / Utterance:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={userInputText}
                  onChange={(e) => setUserInputText(e.target.value)}
                  placeholder="e.g. Yes, I received the kit / Baad me baat karo"
                  className="flex-1 text-xs border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && userInputText.trim()) {
                      handleSimulateUtterance(userInputText);
                    }
                  }}
                />
                <button
                  onClick={() => userInputText.trim() && handleSimulateUtterance(userInputText)}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition"
                >
                  Speak
                </button>
              </div>

              {/* Edge Case Simulation Buttons */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[11px] font-semibold text-slate-500 mb-1.5">Edge Case Handlers:</p>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={handleBargeIn}
                    className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[11px] rounded transition"
                  >
                    Barge-in (Interrupt)
                  </button>
                  <button
                    onClick={handleSilenceTimeout}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-[11px] rounded transition"
                  >
                    Silence Timeout
                  </button>
                  <button
                    onClick={handleUnclearSpeech}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-[11px] rounded transition"
                  >
                    Unclear Audio
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Latency Metrics & Disposable State */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-slate-800 border-b pb-2">Latency Budget & Metrics</h2>
          {latestLatency ? (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">STT TTFT:</span>
                <span className="font-mono text-emerald-600 font-semibold">{latestLatency.sttTtftMs} ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">LLM TTFT:</span>
                <span className="font-mono text-emerald-600 font-semibold">{latestLatency.llmTtftMs} ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">TTS TTFA:</span>
                <span className="font-mono text-emerald-600 font-semibold">{latestLatency.ttsTtfaMs} ms</span>
              </div>
              <div className="flex justify-between border-t pt-1">
                <span className="font-semibold text-slate-700">Total Turnaround:</span>
                <span className="font-mono text-blue-700 font-bold">{latestLatency.totalEndToEndMs} ms</span>
              </div>
              {latestLatency.bargeInMs > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span>Barge-in Cutoff:</span>
                  <span className="font-mono font-semibold">{latestLatency.bargeInMs} ms</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No turn latency measured yet.</p>
          )}

          <div className="border-t pt-3">
            <h3 className="text-xs font-semibold text-slate-700 mb-1.5">Mock Disposable State Log:</h3>
            <div className="text-[11px] space-y-1 text-slate-600 max-h-36 overflow-y-auto">
              <div>Callbacks: {store.getCallbacks().length}</div>
              <div>Opt-outs: {store.getOptOuts().length}</div>
              <div>Handoffs: {store.getHandoffs().length}</div>
              <div>Outcomes: {store.getOutcomes().length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Conversation Transcript Feed */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-3">
        <div className="flex justify-between items-center border-b pb-2">
          <h2 className="text-sm font-semibold text-slate-800">Local Session Transcript (Non-Persistent)</h2>
          <span className="text-xs text-slate-500">{statusMessage}</span>
        </div>

        <div className="space-y-3 max-h-72 overflow-y-auto p-3 bg-slate-50 rounded border border-slate-200">
          {turns.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-4">Session has not started yet.</p>
          ) : (
            turns.map((turn) => (
              <div
                key={turn.id}
                className={`p-3 rounded-lg text-xs leading-relaxed max-w-xl ${
                  turn.speaker === 'assistant'
                    ? 'bg-blue-50 border border-blue-200 text-blue-950 mr-auto'
                    : 'bg-emerald-50 border border-emerald-200 text-emerald-950 ml-auto'
                }`}
              >
                <div className="flex justify-between items-center font-bold text-[10px] text-slate-500 mb-1 uppercase">
                  <span>{turn.speaker}</span>
                  {turn.interrupted && <span className="text-amber-700 font-semibold">[INTERRUPTED / BARGE-IN]</span>}
                  {turn.language && <span>Lang: {turn.language}</span>}
                </div>
                <p>{turn.text}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
export default VoiceStaffHarness;
