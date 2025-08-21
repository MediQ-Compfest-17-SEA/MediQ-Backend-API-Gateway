# MediQ WebSocket Integration Examples

## WebSocket Connection

### JavaScript/TypeScript Client
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:8601/api/websocket', {
  auth: {
    token: 'YOUR_JWT_ACCESS_TOKEN'
  }
});

// Connection events
socket.on('connected', (data) => {
  console.log('Connected:', data);
});

socket.on('error', (error) => {
  console.error('WebSocket Error:', error);
});
```

## Notification Subscriptions

### Subscribe to All Notifications
```javascript
socket.emit('subscribe_notifications', {
  userId: 'user-123',
  types: ['registration_success', 'queue_joined', 'queue_almost_ready', 'queue_ready', 'consultation_completed']
});

socket.on('subscription_confirmed', (data) => {
  console.log('Subscription confirmed:', data);
});
```

### Subscribe to Queue Updates
```javascript
socket.emit('subscribe_queue_updates', {
  institutionId: 'institution-456'
});

socket.on('queue_updated', (data) => {
  console.log('Queue updated:', data);
  // Update UI with new queue status
});
```

## Notification Event Handlers

### Registration Success
```javascript
socket.on('notification', (notification) => {
  if (notification.type === 'registration_success') {
    showWelcomeMessage(notification.title, notification.message);
  }
});
```

### Queue Almost Ready (5 numbers before)
```javascript
socket.on('notification', (notification) => {
  if (notification.type === 'queue_almost_ready') {
    showUrgentAlert(notification.title, notification.message);
    // Start preparing user for consultation
  }
});
```

### Queue Ready (Number called)
```javascript
socket.on('notification', (notification) => {
  if (notification.type === 'queue_ready') {
    showCallAlert(notification.title, notification.message);
    // Navigate to consultation screen
  }
});
```

## Real-time Queue Monitoring

### Get Current Queue Status
```javascript
socket.emit('get_queue_status', {
  institutionId: 'institution-456'
});

socket.on('queue_status', (status) => {
  updateQueueDisplay({
    currentQueue: status.currentQueue,
    totalWaiting: status.totalWaiting,
    estimatedWaitTime: status.estimatedWaitTime
  });
});
```

## React Hook Example

```javascript
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export const useWebSocket = (token, userId) => {
  const [socket, setSocket] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [queueStatus, setQueueStatus] = useState(null);

  useEffect(() => {
    if (!token) return;

    const newSocket = io('http://localhost:8601/api/websocket', {
      auth: { token }
    });

    newSocket.on('connected', (data) => {
      console.log('WebSocket connected:', data);
      
      // Subscribe to notifications
      newSocket.emit('subscribe_notifications', {
        userId,
        types: ['queue_almost_ready', 'queue_ready']
      });
    });

    newSocket.on('notification', (notification) => {
      setNotifications(prev => [...prev, notification]);
      
      // Show notification to user
      if (notification.priority === 'urgent') {
        showUrgentNotification(notification);
      }
    });

    newSocket.on('queue_updated', (update) => {
      setQueueStatus(update);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token, userId]);

  return { socket, notifications, queueStatus };
};
```

## REST API for Notifications

### Subscribe to Notifications
```bash
curl -X POST http://localhost:8601/notifications/subscribe \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "types": ["queue_ready", "queue_almost_ready"],
    "institutionId": "institution-456"
  }'
```

### Get WebSocket Status
```bash
curl -X GET http://localhost:8601/notifications/status/websocket
```

### Broadcast Queue Update (Admin/Operator only)
```bash
curl -X POST http://localhost:8601/notifications/queue/institution-456/broadcast \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentQueue": 15,
    "action": "next",
    "queueNumber": 15,
    "message": "Queue number 15 is now being served"
  }'
```
