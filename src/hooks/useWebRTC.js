import { useCallback, useEffect, useRef } from 'react';
import freeice from 'freeice';

import { useStateWithCb } from './useStateWithCb';
import socket from '../socket';
import ACTIONS from '../socket/actions';

export const LOCAL_VIDEO = 'LOCAL_VIDEO';

export default function useWebRTC(roomID) {
  const [clients, updateClients] = useStateWithCb([]);

  const addNewClient = useCallback(
    (newClient, cb) => {
      if (!clients.includes(newClient)) {
        updateClients(prevClients => [...prevClients, newClient], cb);
      }
    },
    [clients, updateClients]
  );

  const peerConnections = useRef({});
  const localMediaStream = useRef({});
  const peerMediaElements = useRef({
    [LOCAL_VIDEO]: null,
  });

  useEffect(() => {
    const addNewPeerHandler = async ({ peerID, createOffer }) => {
      if (peerID in peerConnections.current) {
        return console.warn(`Already connected to peer ${peerID}`);
      }

      const pcConfig = {
        iceServers: [
          // {
          //   urls: 'stun:webrtc.gdmn.app:3478',
          // },
          {
            urls: 'turn:webrtc.gdmn.app:3478',
            username: '1',
            credential: '1',
          },
        ],
        iceTransportPolicy: 'relay', // Это указывает на использование только TURN
      };
      const ICE_SERVERS = {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      };
      peerConnections.current[peerID] = new RTCPeerConnection(pcConfig);

      // STUN сервер  stun:webrtc.gdmn.app:3478
      // TURN сервер turn:webrtc.gdmn.app:3478
      // для TURN сервера надо попробовать и без логина пароля и с логином паролем
      // логин 1
      // пароль 1
      console.log('PC CONFIG', pcConfig);
      console.log('PC CONFIG222', freeice());
      peerConnections.current[peerID].onicecandidate = e => {
        if (e.candidate) {
          console.log('New ICE candidate:', e.candidate);
          socket.emit(ACTIONS.RELAY_ICE, { peerID, iceCandidate: e.candidate });
        }
      };

      let tracksNumber = 0;
      peerConnections.current[peerID].ontrack = ({ streams: [remoteStream] }) => {
        tracksNumber++;

        if (tracksNumber === 2) {
          // video & audio track received
          addNewClient(peerID, () => {
            peerMediaElements.current[peerID].srcObject = remoteStream;
          });
        }
      };

      localMediaStream.current.getTracks().forEach(track => {
        peerConnections.current[peerID].addTrack(track, localMediaStream.current);
      });

      if (createOffer) {
        const offer = await peerConnections.current[peerID].createOffer();
        await peerConnections.current[peerID].setLocalDescription(offer);

        socket.emit(ACTIONS.RELAY_SDP, {
          peerID,
          sessionDescription: offer,
        });
      }
    };

    socket.on(ACTIONS.ADD_PEER, addNewPeerHandler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function setRemoteMedia({ peerID, sessionDescription: remoteDescription }) {
      await peerConnections.current[peerID]?.setRemoteDescription(
        new RTCSessionDescription(remoteDescription)
      );

      if (remoteDescription.type === 'offer') {
        const answer = await peerConnections.current[peerID].createAnswer();

        await peerConnections.current[peerID].setLocalDescription(answer);

        socket.emit(ACTIONS.RELAY_SDP, {
          peerID,
          sessionDescription: answer,
        });
      }
    }

    socket.on(ACTIONS.SESSION_DESCRIPTION, setRemoteMedia);

    return () => {
      socket.off(ACTIONS.SESSION_DESCRIPTION);
    };
  }, []);

  useEffect(() => {
    socket.on(ACTIONS.ICE_CANDIDATE, ({ peerID, iceCandidate }) => {
      peerConnections.current[peerID].addIceCandidate(new RTCIceCandidate(iceCandidate));
    });
  }, []);

  useEffect(() => {
    const removePeerHandler = ({ peerID }) => {
      if (peerID in peerConnections.current) {
        peerConnections.current[peerID].close();
      }
      delete peerConnections.current[peerID];
      delete peerMediaElements.current[peerID];
      updateClients(prevClients => prevClients.filter(client => client !== peerID));
    };

    socket.on(ACTIONS.REMOVE_PEER, removePeerHandler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function startCapture() {
      localMediaStream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: { max: 640 },
          height: { max: 480 },
        },
        // video: {
        //   width: 1280,
        //   height: 720,
        // },
      });

      addNewClient(LOCAL_VIDEO, () => {
        const localVideoElement = peerMediaElements.current[LOCAL_VIDEO];

        if (localVideoElement) {
          localVideoElement.volume = 0;
          localVideoElement.srcObject = localMediaStream.current;
        }
      });
    }

    startCapture()
      .then(() => socket.emit(ACTIONS.JOIN, { room: roomID }))
      .catch(e => console.error('Error getting userMedia', e));

    return () => {
      if (localMediaStream.current.getTracks) {
        localMediaStream.current.getTracks().forEach(track => track.stop());
        socket.emit(ACTIONS.LEAVE);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomID]);

  const provideMediaRef = useCallback((id, node) => {
    peerMediaElements.current[id] = node;
  }, []);

  return { clients, provideMediaRef };
}
