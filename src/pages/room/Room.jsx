import React, { useRef, useEffect } from 'react';
import { useWebRtcNew } from '../../hooks/useWebRtcNew';

const layout = (clientsNumber = 1) => {
  const pairs = Array.from({ length: clientsNumber }).reduce((acc, _, index, arr) => {
    if (!(index % 2)) acc.push(arr.slice(index, index + 2));
    return acc;
  }, []);

  const rowsNumber = pairs.length;
  const height = `${100 / rowsNumber}%`;

  return pairs
    .map((row, index, arr) => {
      return index === arr.length - 1 && row.length === 1
        ? [{ width: '100%', height }]
        : row.map(() => ({ width: '50%', height }));
    })
    .flat();
};

const Room = () => {
  const { localStream, remoteStreams } = useWebRtcNew();
  const localVideoRef = useRef();
  const remoteVideoRefs = useRef({}); // Хранение ссылок на все видео элементов
  console.log('remoteStreams', remoteStreams);
  const videoLayout = layout(remoteStreams.length + 1);
  // Устанавливаем локальный стрим в видео элемент
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Устанавливаем удаленные стримы в соответствующие видео элементы
  useEffect(() => {
    remoteStreams.forEach(({ id, stream }) => {
      if (remoteVideoRefs.current[id]) {
        remoteVideoRefs.current[id].srcObject = stream;
      }
    });
  }, [remoteStreams]);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          height: '100vh',
        }}
      >
        <div style={videoLayout[0]}>
          <video width='100%' height='100%' ref={localVideoRef} autoPlay playsInline />
        </div>
        {remoteStreams.map(({ id }, index) => (
          <div key={id} style={videoLayout[index + 1]}>
            <video
              width='100%'
              height='100%'
              ref={el => {
                remoteVideoRefs.current[id] = el;
              }}
              autoPlay
              playsInline
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default Room;
