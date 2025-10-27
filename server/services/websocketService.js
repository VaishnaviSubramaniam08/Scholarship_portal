const WebSocket = require('ws');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // Store client connections by user ID
  }

  initialize(server) {
    this.wss = new WebSocket.Server({ 
      server,
      verifyClient: (info) => {
        // Add basic verification to prevent spam connections
        const origin = info.origin;
        const allowedOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
        return allowedOrigins.includes(origin);
      }
    });
    
    this.wss.on('connection', (ws, req) => {
      console.log('✅ New WebSocket connection established');
      
      // Set connection properties
      ws.isAlive = true;
      ws.authenticated = false;
      ws.userId = null;
      
      // Handle pong responses for keep-alive
      ws.on('pong', () => {
        ws.isAlive = true;
      });
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleMessage(ws, data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Invalid message format'
            }));
          }
        }
      });

      ws.on('close', (code, reason) => {
        console.log('WebSocket connection closed:', code, reason.toString());
        
        // Remove client from tracking
        if (ws.userId) {
          this.clients.delete(ws.userId);
          console.log(`Removed user ${ws.userId} from WebSocket tracking`);
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });

    // Set up ping/pong keep-alive mechanism
    const interval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          console.log('Terminating inactive WebSocket connection');
          ws.terminate();
          return;
        }
        
        ws.isAlive = false;
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });
    }, 30000); // Ping every 30 seconds

    // Clean up interval when server closes
    this.wss.on('close', () => {
      clearInterval(interval);
    });

    console.log('✅ WebSocket service initialized');
  }

  handleMessage(ws, data) {
    switch (data.type) {
      case 'authenticate':
        this.authenticateClient(ws, data.token);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      default:
        console.log('Unknown message type:', data.type);
    }
  }

  authenticateClient(ws, token) {
    try {
      // Check if already authenticated
      if (ws.authenticated) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Already authenticated'
        }));
        return;
      }

      // In a real implementation, you would verify the JWT token here
      // For now, we'll assume the token is valid and extract user info
      // You can use the same JWT verification logic from your auth middleware
      
      // Mock authentication - replace with actual JWT verification
      const userId = token; // In real implementation, decode JWT to get user ID
      
      if (userId) {
        // Check if user already has an active connection
        const existingConnection = this.clients.get(userId);
        if (existingConnection && existingConnection.readyState === WebSocket.OPEN) {
          // Close the existing connection
          existingConnection.close(1000, 'New connection established');
        }
        
        // Set up the new connection
        ws.userId = userId;
        ws.authenticated = true;
        this.clients.set(userId, ws);
        
        ws.send(JSON.stringify({
          type: 'authenticated',
          message: 'Successfully authenticated'
        }));
        console.log(`✅ Client authenticated: ${userId}`);
      } else {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid authentication token'
        }));
      }
    } catch (error) {
      console.error('Authentication error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Authentication failed'
      }));
    }
  }

  // Send notification to specific user
  sendToUser(userId, message) {
    const client = this.clients.get(userId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  // Send notification to all users with specific role
  sendToRole(role, message) {
    let sentCount = 0;
    // In a real implementation, you would need to track user roles
    // For now, we'll send to all connected clients
    this.clients.forEach((client, userId) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
        sentCount++;
      }
    });
    return sentCount;
  }

  // Broadcast to all connected clients
  broadcast(message) {
    let sentCount = 0;
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
        sentCount++;
      }
    });
    return sentCount;
  }

  // Application-specific notification methods
  notifyApplicationStatusUpdate(application, studentId, newStatus) {
    const message = {
      type: 'application_status_update',
      data: {
        applicationId: application._id,
        scholarshipName: application.scholarship.name,
        newStatus: newStatus,
        updatedAt: new Date().toISOString()
      }
    };

    // Notify the student who applied
    this.sendToUser(studentId, message);

    // Notify all reviewers and admins
    const adminMessage = {
      ...message,
      type: 'application_reviewed',
      data: {
        ...message.data,
        studentName: `${application.student.firstName} ${application.student.lastName}`,
        reviewerNotes: application.reviewerNotes
      }
    };
    
    this.sendToRole('reviewer', adminMessage);
    this.sendToRole('admin', adminMessage);

    console.log(`📢 Application status update broadcasted: ${application._id} -> ${newStatus}`);
  }

  notifyNewApplication(application) {
    const message = {
      type: 'new_application',
      data: {
        applicationId: application._id,
        scholarshipName: application.scholarship.name,
        studentName: `${application.student.firstName} ${application.student.lastName}`,
        submittedAt: application.submittedAt
      }
    };

    // Notify all reviewers and admins
    this.sendToRole('reviewer', message);
    this.sendToRole('admin', message);

    console.log(`📢 New application notification broadcasted: ${application._id}`);
  }

  notifyScholarshipCreated(scholarship) {
    const message = {
      type: 'new_scholarship',
      data: {
        scholarshipId: scholarship._id,
        name: scholarship.name,
        amount: scholarship.amount,
        deadline: scholarship.deadline
      }
    };

    // Notify all students
    this.sendToRole('student', message);

    console.log(`📢 New scholarship notification broadcasted: ${scholarship._id}`);
  }

  notifyScholarshipUpdated(scholarship) {
    const message = {
      type: 'scholarship_updated',
      data: {
        scholarshipId: scholarship._id,
        name: scholarship.name,
        amount: scholarship.amount,
        deadline: scholarship.deadline,
        status: scholarship.status
      }
    };

    // Notify all students
    this.sendToRole('student', message);

    console.log(`📢 Scholarship update notification broadcasted: ${scholarship._id}`);
  }

  // Get connection statistics
  getStats() {
    return {
      totalConnections: this.clients.size,
      connectedUsers: Array.from(this.clients.keys())
    };
  }
}

module.exports = new WebSocketService();
