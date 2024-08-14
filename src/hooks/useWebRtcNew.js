import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const SIGNALING_SERVER_URL = '/';
const PC_CONFIG = {};

export const useWebRtcNew = () => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const peersRef = useRef({});
  const pendingCandidatesRef = useRef({});
  const socketRef = useRef(null);

  // Получение локального потока и установка его в состояние
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then(stream => {
        setLocalStream(stream);
      })
      .catch(error => console.error('Stream not found: ', error));

    return () => {
      // Очищаем локальный поток при размонтировании
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // WebRTC и Socket.io логика
  useEffect(() => {
    if (!localStream) return;

    const createPeerConnection = sid => {
      const pc = new RTCPeerConnection(PC_CONFIG);

      pc.onicecandidate = event => {
        if (event.candidate) {
          socketRef.current.emit('data', {
            sid,
            type: 'candidate',
            candidate: event.candidate,
          });
        }
      };

      pc.ontrack = event => {
        setRemoteStreams(prevStreams => {
          const existingStream = prevStreams.find(el => el.id === sid);

          if (existingStream && existingStream.stream.id === event.streams[0].id) {
            // Если стрим с таким ID уже существует, пропускаем обновление
            return prevStreams;
          }

          // Иначе добавляем новый стрим
          return [
            ...prevStreams.filter(el => el.id !== sid),
            { id: sid, stream: event.streams[0] },
          ];
        });
      };

      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });

      return pc;
    };

    const sendOffer = sid => {
      const peerConnection = peersRef.current[sid];
      peerConnection
        .createOffer()
        .then(sdp => {
          peerConnection.setLocalDescription(sdp);
          socketRef.current.emit('data', {
            sid,
            type: sdp.type,
            sdp: sdp.sdp,
          });
        })
        .catch(error => console.error('Send offer failed: ', error));
    };

    const sendAnswer = sid => {
      const peerConnection = peersRef.current[sid];
      peerConnection
        .createAnswer()
        .then(sdp => {
          peerConnection.setLocalDescription(sdp);
          socketRef.current.emit('data', {
            sid,
            type: sdp.type,
            sdp: sdp.sdp,
          });
        })
        .catch(error => console.error('Send answer failed: ', error));
    };

    const handleSignalingData = data => {
      const sid = data.sid;
      delete data.sid;

      switch (data.type) {
        case 'offer':
          handleOffer(sid, data);
          break;
        case 'answer':
          handleAnswer(sid, data);
          break;
        case 'candidate':
          handleCandidate(sid, data.candidate);
          break;
        default:
          break;
      }
    };

    const handleReady = msg => {
      const peerConnection = createPeerConnection(msg.sid);
      peersRef.current[msg.sid] = peerConnection;
      sendOffer(msg.sid);
      addPendingCandidates(msg.sid);
    };

    const handleOffer = (sid, data) => {
      const peerConnection = createPeerConnection(sid);
      peersRef.current[sid] = peerConnection;
      peerConnection.setRemoteDescription(new RTCSessionDescription(data));
      sendAnswer(sid);
      addPendingCandidates(sid);
    };

    const handleAnswer = (sid, data) => {
      const peerConnection = peersRef.current[sid];
      peerConnection.setRemoteDescription(new RTCSessionDescription(data));
    };

    const handleCandidate = (sid, candidate) => {
      if (peersRef.current[sid]) {
        peersRef.current[sid].addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        if (!pendingCandidatesRef.current[sid]) {
          pendingCandidatesRef.current[sid] = [];
        }
        pendingCandidatesRef.current[sid].push(candidate);
      }
    };

    const addPendingCandidates = sid => {
      if (pendingCandidatesRef.current[sid]) {
        pendingCandidatesRef.current[sid].forEach(candidate => {
          peersRef.current[sid].addIceCandidate(new RTCIceCandidate(candidate));
        });
        delete pendingCandidatesRef.current[sid];
      }
    };

    const handleUserDisconnected = ({ sid }) => {
      // Удаляем удаленные стримы из состояния
      setRemoteStreams(prevStreams => prevStreams.filter(stream => stream.id !== sid));

      // Удаляем peerConnection и pendingCandidates для этого sid
      delete peersRef.current[sid];
      delete pendingCandidatesRef.current[sid];
    };

    const socket = io(SIGNALING_SERVER_URL, { autoConnect: false });
    socketRef.current = socket;

    socket.on('data', handleSignalingData);
    socket.on('ready', handleReady);
    socket.on('user-disconnected', handleUserDisconnected);

    socket.connect();

    return () => {
      // Отключаемся и очищаем данные при размонтировании компонента
      socket.off('user-disconnected', handleUserDisconnected);
      socket.off('data', handleSignalingData);
      socket.off('ready', handleReady);
      socket.disconnect();
      Object.values(peersRef.current).forEach(peer => peer.close());
    };
  }, [localStream]);

  return { localStream, remoteStreams };
};
