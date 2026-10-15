'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Room, RoomEvent, Track, RemoteTrack, RemoteParticipant } from 'livekit-client';
import { VoiceConversationStateMachine, StateMachineOutput } from '../state-machine';
import {
  MockDisposableStateStore,
  FIXED_SYNTHETIC_TASK,
  FIXED_DOCUMENT_FOLLOWUP_TASK,
} from '../mock-tools';
import {
  SyntheticVoicePipelineRunner,
  fetchVoiceTokenStatus,
  requestVoiceSessionToken,
  releaseVoiceSessionReservation,
  ProviderConfigStatus,
  LatencyReport,
} from '../livekit-pipeline-adapter';
import { ConversationState, LanguageTarget, ConversationTurn } from '../types';

export function VoiceStaffHarness() {
  const [store] = useState(() => new MockDisposableStateStore());
  const [stateMachine, setStateMachine] = useState<VoiceConversationStateMachine | null>(null);
  const [pipelineRunner, setPipelineRunner] = useState<SyntheticVoicePipelineRunner | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<'DOCUMENT' | 'GENERAL'>('DOCUMENT');
  const [docStatusCounter, setDocStatusCounter] = useState<number>(0);

  // Server Provider Config Status
  const [providerConfig, setProviderConfig] = useState<ProviderConfigStatus>({
    configured: false,
    status: 'NOT_CONFIGURED',
    statusDescription: 'Checking server credentials status...',
  });

  // Real WebRTC Media Session State
  const [livekitRoom, setLivekitRoom] = useState<Room | null>(null);
  const [isWebRtcConnected, setIsWebRtcConnected] = useState<boolean>(false);
  const [micPermissionDenied, setMicPermissionDenied] = useState<string | null>(null);
  const [remoteAudioAttached, setRemoteAudioAttached] = useState<boolean>(false);

  // Common UI & Evaluation State
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

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const currentRoomNameRef = useRef<string | null>(null);

  // Fetch server configuration status on mount (read-only; does not reserve a session)
  useEffect(() => {
    let isMounted = true;
    fetchVoiceTokenStatus().then((status) => {
      if (isMounted) {
        setProviderConfig(status);
        if (!status.configured) {
          setStatusMessage('Server providers not configured. Synthetic simulator active.');
        } else {
          setStatusMessage('LiveKit server ready for WebRTC audio session.');
        }
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Clean up all media tracks, room connections, session reservations, and timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (currentRoomNameRef.current) {
        releaseVoiceSessionReservation(currentRoomNameRef.current);
        currentRoomNameRef.current = null;
      }
      if (livekitRoom) {
        livekitRoom.disconnect();
      }
      if (pipelineRunner) {
        pipelineRunner.stopMicrophone();
      }
    };
  }, [livekitRoom, pipelineRunner]);

  // Emergency Stop / Graceful Hang-up Handler
  const handleEmergencyStop = useCallback(
    async (reason: string = 'Staff terminated session') => {
      // 1. Terminate state machine
      if (stateMachine && sessionActive) {
        stateMachine.terminateSession('COMPLETED', 'Session ended by staff operator.', reason);
        setCurrentState(stateMachine.getState());
        setTurns(stateMachine.getTurns());
      }

      // 2. Release server session reservation
      if (currentRoomNameRef.current) {
        releaseVoiceSessionReservation(currentRoomNameRef.current);
        currentRoomNameRef.current = null;
      }

      // 3. Disconnect real WebRTC session and stop local tracks
      if (livekitRoom) {
        try {
          if (livekitRoom.localParticipant) {
            await livekitRoom.localParticipant.setMicrophoneEnabled(false);
            livekitRoom.localParticipant.trackPublications.forEach((pub) => {
              if (pub.track) {
                pub.track.stop();
              }
            });
          }
          await livekitRoom.disconnect();
        } catch (e) {
          console.warn('[VoiceHarness] Error disconnecting LiveKit room:', e);
        }
        setLivekitRoom(null);
        setIsWebRtcConnected(false);
        setRemoteAudioAttached(false);
      }

      // 4. Stop synthetic runner
      if (pipelineRunner) {
        pipelineRunner.stopMicrophone();
      }

      // 5. Detach any audio DOM nodes
      if (audioContainerRef.current) {
        audioContainerRef.current.innerHTML = '';
      }

      setSessionActive(false);
      setMicActive(false);
      setIsMuted(false);
      setStatusMessage(`Session terminated: ${reason}`);
    },
    [stateMachine, sessionActive, livekitRoom, pipelineRunner]
  );

  // Session duration timer with strict 180s ceiling
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
  }, [sessionActive, stateMachine, handleEmergencyStop]);

  // Start Session (Real WebRTC if configured, or Deterministic Synthetic Simulator)
  const handleStartSession = async (lang: LanguageTarget) => {
    setMicPermissionDenied(null);
    store.clear();
    const task = selectedScenario === 'DOCUMENT' ? FIXED_DOCUMENT_FOLLOWUP_TASK : FIXED_SYNTHETIC_TASK;
    const sm = new VoiceConversationStateMachine(store, { defaultLanguage: lang }, task);
    const runner = new SyntheticVoicePipelineRunner(sm, store);

    setStateMachine(sm);
    setPipelineRunner(runner);

    const greeting = sm.startSession(lang);
    setCurrentState(greeting.state);
    setCurrentLanguage(greeting.language);
    setTurns(sm.getTurns());
    setSessionActive(true);
    setIsMuted(false);

    // If LiveKit credentials are ready, reserve an evaluation session and initiate real WebRTC room connection
    if (providerConfig.configured) {
      setStatusMessage('Reserving session and generating LiveKit token...');
      const reservation = await requestVoiceSessionToken();

      if (!reservation.success) {
        if (reservation.statusCode === 429) {
          setStatusMessage(reservation.error || 'Concurrency ceiling reached (1 session max). Please wait.');
          setSessionActive(false);
          return;
        }
        console.warn('[VoiceHarness] Token reservation failed:', reservation.error);
        setStatusMessage(`Reservation failed: ${reservation.error}. Falling back to synthetic harness.`);
        runner.startMicrophone();
        setMicActive(true);
        return;
      }

      if (reservation.configured && reservation.serverUrl && reservation.token && reservation.roomName) {
        currentRoomNameRef.current = reservation.roomName;
        try {
          setStatusMessage('Connecting to LiveKit WebRTC audio room...');
          const room = new Room({
            adaptiveStream: true,
            dynacast: true,
            audioCaptureDefaults: {
              autoGainControl: true,
              echoCancellation: true,
              noiseSuppression: true,
            },
          });

          // Listen for agent participant connection
          room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
            setStatusMessage(`Participant joined room: ${participant.identity}`);
          });

          // Track subscriptions
          room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication, participant: RemoteParticipant) => {
            if (track.kind === Track.Kind.Audio) {
              const audioEl = track.attach();
              audioEl.autoplay = true;
              if (audioContainerRef.current) {
                audioContainerRef.current.appendChild(audioEl);
              }
              setRemoteAudioAttached(true);
              setStatusMessage(`Agent voice audio connected (${participant.identity || 'Agent'}).`);
            }
          });

          room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
            track.detach();
            setRemoteAudioAttached(false);
          });

          room.on(RoomEvent.Disconnected, () => {
            setIsWebRtcConnected(false);
            setRemoteAudioAttached(false);
          });

          // Connect room
          await room.connect(reservation.serverUrl, reservation.token);
          setLivekitRoom(room);
          setIsWebRtcConnected(true);

          // Publish local microphone
          try {
            await room.localParticipant.setMicrophoneEnabled(true);
            setMicActive(true);
            setStatusMessage(`Live WebRTC session connected (${lang.toUpperCase()}). Microphone live.`);
          } catch (micErr: any) {
            const errMsg = micErr?.message || 'Microphone access was denied by browser.';
            setMicPermissionDenied(`Microphone permission error: ${errMsg}. Real audio input unavailable.`);
            setMicActive(false);
            // Fall back to synthetic speech input simulation
            runner.startMicrophone();
          }
        } catch (connErr: any) {
          console.error('[VoiceHarness] WebRTC connection failed:', connErr);
          if (currentRoomNameRef.current) {
            releaseVoiceSessionReservation(currentRoomNameRef.current);
            currentRoomNameRef.current = null;
          }
          setStatusMessage(`LiveKit connection failed (${connErr?.message || 'error'}). Falling back to synthetic harness.`);
          runner.startMicrophone();
          setMicActive(true);
        }
      }
    } else {
      // Offline/Synthetic evaluation mode
      runner.startMicrophone();
      setMicActive(true);
      setStatusMessage(`Synthetic session active (${lang.toUpperCase()}). AI/Audio Path: NOT EXECUTED.`);
    }
  };

  // Toggle Mute / Unmute
  const handleToggleMute = async () => {
    const newMute = !isMuted;
    if (livekitRoom?.localParticipant) {
      try {
        await livekitRoom.localParticipant.setMicrophoneEnabled(!newMute);
      } catch (e) {
        console.warn('[VoiceHarness] Failed to toggle LiveKit mic:', e);
      }
    }
    if (pipelineRunner) {
      pipelineRunner.setMute(newMute);
    }
    setIsMuted(newMute);
    setStatusMessage(newMute ? 'Microphone muted' : 'Microphone active');
  };

  // Simulate Staff Speech Utterance
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
        await handleEmergencyStop(res.output.terminationReason || 'Conversation finished');
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
      handleEmergencyStop('Silence timeout reached (max prompts)');
    } else {
      setStatusMessage('Silence detected: Re-prompted user.');
    }
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
      {/* Hidden container for WebRTC audio playback elements */}
      <div ref={audioContainerRef} className="hidden" aria-hidden="true" />

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
              Provider Mode: {providerConfig.statusDescription}
            </div>
          </div>
        </div>
      </div>

      {/* Mic Permission Denied Alert */}
      {micPermissionDenied && (
        <div className="bg-rose-50 border-l-4 border-rose-600 p-3 rounded-r text-xs text-rose-800">
          <span className="font-bold">Microphone Notice: </span>
          {micPermissionDenied}
        </div>
      )}

      {/* Main Control Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Session Telemetry & Controls */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-slate-800 border-b pb-2">Session Telemetry</h2>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Status:</span>
              <span className={`font-semibold ${sessionActive ? 'text-emerald-600' : 'text-slate-600'}`}>
                {sessionActive ? (isWebRtcConnected ? '● LIVE WEBRTC' : '● ACTIVE (SYNTHETIC)') : '○ IDLE'}
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
            {isWebRtcConnected && (
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Agent Audio:</span>
                <span className={`font-semibold ${remoteAudioAttached ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {remoteAudioAttached ? 'RECEIVING' : 'WAITING'}
                </span>
              </div>
            )}
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
              <p className="text-xs font-medium text-slate-600">Start Session in:</p>
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
          <div className="border-b pb-2 flex justify-between items-center">
            <h2 className="text-base font-semibold text-slate-800">Synthetic Scenario Context</h2>
            {!sessionActive && (
              <div className="flex gap-1.5">
                <button
                  onClick={() => setSelectedScenario('DOCUMENT')}
                  className={`px-2 py-0.5 text-[11px] rounded border transition ${
                    selectedScenario === 'DOCUMENT'
                      ? 'bg-blue-100 border-blue-300 text-blue-900 font-semibold'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Document Follow-up
                </button>
                <button
                  onClick={() => setSelectedScenario('GENERAL')}
                  className={`px-2 py-0.5 text-[11px] rounded border transition ${
                    selectedScenario === 'GENERAL'
                      ? 'bg-blue-100 border-blue-300 text-blue-900 font-semibold'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  General Task
                </button>
              </div>
            )}
          </div>

          {selectedScenario === 'DOCUMENT' ? (
            <div className="bg-slate-50 p-3 rounded text-xs space-y-2 border border-slate-200">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-700">Task: {FIXED_DOCUMENT_FOLLOWUP_TASK.taskId}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  (store.getDocument(FIXED_DOCUMENT_FOLLOWUP_TASK.taskId)?.status || 'MISSING') === 'VERIFIED'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : (store.getDocument(FIXED_DOCUMENT_FOLLOWUP_TASK.taskId)?.status || 'MISSING') === 'UPLOADED'
                    ? 'bg-blue-100 text-blue-800 border border-blue-300'
                    : (store.getDocument(FIXED_DOCUMENT_FOLLOWUP_TASK.taskId)?.status || 'MISSING') === 'PENDING_UPLOAD'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                }`}>
                  DB STATUS: {store.getDocument(FIXED_DOCUMENT_FOLLOWUP_TASK.taskId)?.status || 'MISSING'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div><span className="text-slate-500">Child:</span> <span className="font-medium text-slate-900">Baby Ananya</span></div>
                <div><span className="text-slate-500">Phone:</span> <span className="font-mono text-slate-900">+91 98XXX-XX123</span></div>
                <div className="col-span-2"><span className="text-slate-500">Document:</span> <span className="font-medium text-slate-900">Child Nutrition & Growth Card</span></div>
              </div>

              {/* Status Simulation Helpers (Strictly Non-Production) */}
              {process.env.NODE_ENV !== 'production' && (
                <div className="pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-semibold text-slate-500">Simulate Database Document Status:</p>
                    <span className="text-[9px] bg-amber-100 text-amber-800 font-mono px-1 rounded">TEST_ONLY</span>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      onClick={() => {
                        store.setDocumentStatus(FIXED_DOCUMENT_FOLLOWUP_TASK.taskId, 'UPLOADED');
                        setDocStatusCounter((c) => c + 1);
                      }}
                      className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 text-[10px] rounded border border-blue-200 transition"
                    >
                      Simulate Uploaded
                    </button>
                    <button
                      onClick={() => {
                        store.setDocumentStatus(FIXED_DOCUMENT_FOLLOWUP_TASK.taskId, 'VERIFIED');
                        setDocStatusCounter((c) => c + 1);
                      }}
                      className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] rounded border border-emerald-200 transition"
                    >
                      Simulate Verified
                    </button>
                    <button
                      onClick={() => {
                        store.setDocumentStatus(FIXED_DOCUMENT_FOLLOWUP_TASK.taskId, 'MISSING');
                        setDocStatusCounter((c) => c + 1);
                      }}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] rounded border border-slate-200 transition"
                    >
                      Reset Missing
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-50 p-3 rounded text-xs space-y-1.5 border border-slate-200">
              <div>
                <span className="font-semibold text-slate-600">Task ID:</span>{' '}
                <span className="font-mono text-slate-900">{FIXED_SYNTHETIC_TASK.taskId}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-600">Task:</span>{' '}
                <span className="text-slate-900 font-medium">{FIXED_SYNTHETIC_TASK.taskDescription}</span>
              </div>
            </div>
          )}

          <div className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-200 font-mono">
            Note: This is a test; no real callback, WhatsApp message or staff notification was created. No beneficiary records or clinical data accessed.
          </div>

          {sessionActive && (
            <div className="space-y-3 pt-2">
              <label className="text-xs font-semibold text-slate-700">Simulate Staff Speech / Utterance:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={userInputText}
                  onChange={(e) => setUserInputText(e.target.value)}
                  placeholder="e.g. Yes, please send the link on WhatsApp / I already sent it"
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

              {/* Quick Prompt Suggestions */}
              {selectedScenario === 'DOCUMENT' && (
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={() => handleSimulateUtterance('Yes, please send the link on WhatsApp')}
                    className="px-2 py-0.5 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded text-[10px] hover:bg-emerald-100"
                  >
                    Send on WhatsApp
                  </button>
                  <button
                    onClick={() => handleSimulateUtterance('I already sent it yesterday')}
                    className="px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 rounded text-[10px] hover:bg-amber-100"
                  >
                    Claim: &quot;I already sent it&quot;
                  </button>
                  <button
                    onClick={() => handleSimulateUtterance('No, I do not use WhatsApp')}
                    className="px-2 py-0.5 bg-rose-50 text-rose-900 border border-rose-200 rounded text-[10px] hover:bg-rose-100"
                  >
                    Decline WhatsApp
                  </button>
                </div>
              )}

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
          <div className="border-b pb-2 flex justify-between items-center">
            <h2 className="text-base font-semibold text-slate-800">Latency Telemetry</h2>
            <span className="text-[10px] bg-slate-100 text-slate-600 font-mono px-2 py-0.5 rounded">
              {latestLatency?.isSimulated ? 'Simulated' : 'Measured'}
            </span>
          </div>

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
              <p className="text-[10px] text-slate-400 italic pt-1">
                Values reflect synthetic simulation benchmarks based on published provider specifications.
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No turn latency recorded yet.</p>
          )}

          <div className="border-t pt-3">
            <h3 className="text-xs font-semibold text-slate-700 mb-1.5">Mock Disposable State Log:</h3>
            <div className="text-[11px] space-y-1 text-slate-600 max-h-36 overflow-y-auto">
              <div>Callbacks: {store.getCallbacks().length}</div>
              <div>Opt-outs: {store.getOptOuts().length}</div>
              <div>Handoffs: {store.getHandoffs().length}</div>
              <div className="font-medium text-emerald-700">WhatsApp Handoffs: {store.getWhatsAppHandoffs().length}</div>
              {store.getWhatsAppHandoffs().length > 0 && (
                <div className="text-[10px] font-mono bg-emerald-50 p-1.5 rounded border border-emerald-200 mt-1">
                  Dispatched: {store.getWhatsAppHandoffs()[store.getWhatsAppHandoffs().length - 1].uploadLinkToken.substring(0, 12)}***
                </div>
              )}
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
