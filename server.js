const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage with file persistence
const dataFile = path.join(__dirname, 'data.json');

// Initialize data storage
let storage = {
  users: [],
  messages: [],
  nextUserId: 1,
  nextMessageId: 1
};

// Load data from file if exists
function loadData() {
  try {
    if (fs.existsSync(dataFile)) {
      const data = fs.readFileSync(dataFile, 'utf8');
      storage = JSON.parse(data);
      console.log('✅ Data loaded from file');
    }
  } catch (error) {
    console.log('📝 Starting with fresh data');
  }
}

// Save data to file
function saveData() {
  try {
    fs.writeFileSync(dataFile, JSON.stringify(storage, null, 2));
  } catch (error) {
    console.error('❌ Error saving data:', error);
  }
}

// Load initial data
loadData();

// Store connected users
const connectedUsers = new Map();

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Add multer for file uploads
const multer = require('multer');
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (req, file, cb) => {
    // Allow images, audio, and video files
    if (file.mimetype.startsWith('image/') || 
        file.mimetype.startsWith('audio/') || 
        file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم'));
    }
  }
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// Update storage structure to include contacts
if (!storage.contacts) {
  storage.contacts = [];
  storage.nextContactId = 1;
}

// Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, phone, password } = req.body;
    
    // Check if user exists
    const existingUser = storage.users.find(user => 
      user.phone === phone || user.username === username
    );
    
    if (existingUser) {
      return res.status(400).json({ error: 'المستخدم موجود بالفعل' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = {
      id: storage.nextUserId++,
      username,
      phone,
      password: hashedPassword,
      isOnline: false,
      lastSeen: new Date()
    };

    storage.users.push(user);
    saveData();

    // Generate token
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret');

    res.status(201).json({ 
      message: 'تم إنشاء الحساب بنجاح',
      token,
      user: { id: user.id, username: user.username, phone: user.phone }
    });
  } catch (error) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    // Find user
    const user = storage.users.find(user => user.phone === phone);
    if (!user) {
      return res.status(400).json({ error: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    }

    // Update user status
    user.isOnline = true;
    saveData();

    // Generate token
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret');

    res.json({ 
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: { id: user.id, username: user.username, phone: user.phone }
    });
  } catch (error) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const currentUserId = req.query.userId || req.headers['user-id'];
    
    // Get user's contacts only
    const userContacts = storage.contacts
      .filter(contact => contact.userId === parseInt(currentUserId))
      .map(contact => {
        const contactUser = storage.users.find(u => u.id === contact.contactId);
        return contactUser ? {
          _id: contactUser.id,
          username: contactUser.username,
          phone: contactUser.phone,
          isOnline: contactUser.isOnline,
          lastSeen: contactUser.lastSeen,
          avatar: contactUser.avatar || null
        } : null;
      })
      .filter(contact => contact !== null);

    res.json(userContacts);
  } catch (error) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

app.get('/api/messages/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.query.currentUserId;
    
    const messages = storage.messages
      .filter(msg => 
        (msg.sender === parseInt(currentUserId) && msg.receiver === parseInt(userId)) ||
        (msg.sender === parseInt(userId) && msg.receiver === parseInt(currentUserId))
      )
      .map(msg => {
        const sender = storage.users.find(u => u.id === msg.sender);
        const receiver = storage.users.find(u => u.id === msg.receiver);
        
        return {
          _id: msg.id,
          sender: { _id: sender.id, username: sender.username },
          receiver: { _id: receiver.id, username: receiver.username },
          content: msg.content,
          timestamp: msg.timestamp,
          isRead: msg.isRead
        };
      })
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Add contact endpoint
app.post('/api/add-contact', async (req, res) => {
  try {
    const { userId, contactPhone } = req.body;

    // Extract just the number without country code
    const phoneNumber = contactPhone.replace(/^\+\d{3}/, '');
    
    // Find the contact user by phone (check both +212 and +966 codes)
    const contactUser = storage.users.find(user => {
      if (!user.phone) return false;
      const userPhoneNumber = user.phone.replace(/^\+\d{3}/, '');
      return userPhoneNumber === phoneNumber;
    });
    
    if (!contactUser) {
      return res.status(404).json({ error: 'لم يتم العثور على مستخدم بهذا الرقم' });
    }

    if (contactUser.id === parseInt(userId)) {
      return res.status(400).json({ error: 'لا يمكنك إضافة نفسك كجهة اتصال' });
    }

    // Check if contact already exists
    const existingContact = storage.contacts.find(contact => 
      contact.userId === parseInt(userId) && contact.contactId === contactUser.id
    );

    if (existingContact) {
      return res.status(400).json({ error: 'جهة الاتصال موجودة بالفعل' });
    }

    // Add contact
    const newContact = {
      id: storage.nextContactId++,
      userId: parseInt(userId),
      contactId: contactUser.id,
      addedAt: new Date()
    };

    storage.contacts.push(newContact);
    saveData();

    res.json({ 
      message: 'تم إضافة جهة الاتصال بنجاح',
      contact: {
        _id: contactUser.id,
        username: contactUser.username,
        phone: contactUser.phone,
        isOnline: contactUser.isOnline,
        lastSeen: contactUser.lastSeen
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Avatar upload endpoint
app.post('/api/upload-avatar', upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'لم يتم تحديد صورة' });
    }

    const { userId } = req.body;
    const avatarUrl = `/uploads/${req.file.filename}`;

    // Update user avatar in storage
    const user = storage.users.find(u => u.id === parseInt(userId));
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    user.avatar = avatarUrl;
    saveData();

    res.json({ 
      message: 'تم تحديث الصورة الشخصية بنجاح',
      avatarUrl: avatarUrl
    });
  } catch (error) {
    res.status(500).json({ error: 'خطأ في رفع الصورة' });
  }
});

// Image upload endpoint
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'لم يتم تحديد صورة' });
    }

    const { senderId, receiverId } = req.body;
    const imageUrl = `/uploads/${req.file.filename}`;

    // Save as message
    const message = {
      id: storage.nextMessageId++,
      sender: parseInt(senderId),
      receiver: parseInt(receiverId),
      content: '',
      imageUrl: imageUrl,
      type: 'image',
      timestamp: new Date(),
      isRead: false
    };

    storage.messages.push(message);
    
    // Auto-add contacts if they don't exist
    const senderContact = storage.contacts.find(c => 
      c.userId === parseInt(receiverId) && c.contactId === parseInt(senderId)
    );
    
    if (!senderContact) {
      storage.contacts.push({
        id: storage.nextContactId++,
        userId: parseInt(receiverId),
        contactId: parseInt(senderId),
        addedAt: new Date()
      });
    }

    const receiverContact = storage.contacts.find(c => 
      c.userId === parseInt(senderId) && c.contactId === parseInt(receiverId)
    );
    
    if (!receiverContact) {
      storage.contacts.push({
        id: storage.nextContactId++,
        userId: parseInt(senderId),
        contactId: parseInt(receiverId),
        addedAt: new Date()
      });
    }

    saveData();

    // Get sender info
    const sender = storage.users.find(u => u.id === parseInt(senderId));

    // Send to receiver if online
    const receiverSocketId = connectedUsers.get(receiverId.toString());
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('receive_message', {
        _id: message.id,
        sender: { _id: sender.id, username: sender.username },
        content: message.content,
        imageUrl: message.imageUrl,
        type: 'image',
        timestamp: message.timestamp
      });
      
      io.to(receiverSocketId).emit('contacts_updated');
    }

    res.json({ 
      message: 'تم رفع الصورة بنجاح',
      imageUrl: imageUrl
    });
  } catch (error) {
    res.status(500).json({ error: 'خطأ في رفع الصورة' });
  }
});

// Audio upload endpoint
app.post('/api/upload-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'لم يتم تحديد ملف صوتي' });
    }

    const { senderId, receiverId } = req.body;
    const audioUrl = `/uploads/${req.file.filename}`;

    // Save as message
    const message = {
      id: storage.nextMessageId++,
      sender: parseInt(senderId),
      receiver: parseInt(receiverId),
      content: '',
      audioUrl: audioUrl,
      type: 'audio',
      timestamp: new Date(),
      isRead: false
    };

    storage.messages.push(message);
    
    // Auto-add contacts if they don't exist
    const senderContact = storage.contacts.find(c => 
      c.userId === parseInt(receiverId) && c.contactId === parseInt(senderId)
    );
    
    if (!senderContact) {
      storage.contacts.push({
        id: storage.nextContactId++,
        userId: parseInt(receiverId),
        contactId: parseInt(senderId),
        addedAt: new Date()
      });
    }

    const receiverContact = storage.contacts.find(c => 
      c.userId === parseInt(senderId) && c.contactId === parseInt(receiverId)
    );
    
    if (!receiverContact) {
      storage.contacts.push({
        id: storage.nextContactId++,
        userId: parseInt(senderId),
        contactId: parseInt(receiverId),
        addedAt: new Date()
      });
    }

    saveData();

    // Get sender info
    const sender = storage.users.find(u => u.id === parseInt(senderId));

    // Send to receiver if online
    const receiverSocketId = connectedUsers.get(receiverId.toString());
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('receive_message', {
        _id: message.id,
        sender: { _id: sender.id, username: sender.username },
        content: message.content,
        audioUrl: message.audioUrl,
        type: 'audio',
        timestamp: message.timestamp
      });
      
      io.to(receiverSocketId).emit('contacts_updated');
    }

    res.json({ 
      message: 'تم رفع الملف الصوتي بنجاح',
      audioUrl: audioUrl
    });
  } catch (error) {
    res.status(500).json({ error: 'خطأ في رفع الملف الصوتي' });
  }
});

// Video upload endpoint
app.post('/api/upload-video', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'لم يتم تحديد ملف فيديو' });
    }

    const { senderId, receiverId } = req.body;
    const videoUrl = `/uploads/${req.file.filename}`;

    // Save as message
    const message = {
      id: storage.nextMessageId++,
      sender: parseInt(senderId),
      receiver: parseInt(receiverId),
      content: '',
      videoUrl: videoUrl,
      type: 'video',
      timestamp: new Date(),
      isRead: false
    };

    storage.messages.push(message);
    
    // Auto-add contacts if they don't exist
    const senderContact = storage.contacts.find(c => 
      c.userId === parseInt(receiverId) && c.contactId === parseInt(senderId)
    );
    
    if (!senderContact) {
      storage.contacts.push({
        id: storage.nextContactId++,
        userId: parseInt(receiverId),
        contactId: parseInt(senderId),
        addedAt: new Date()
      });
    }

    const receiverContact = storage.contacts.find(c => 
      c.userId === parseInt(senderId) && c.contactId === parseInt(receiverId)
    );
    
    if (!receiverContact) {
      storage.contacts.push({
        id: storage.nextContactId++,
        userId: parseInt(senderId),
        contactId: parseInt(receiverId),
        addedAt: new Date()
      });
    }

    saveData();

    // Get sender info
    const sender = storage.users.find(u => u.id === parseInt(senderId));

    // Send to receiver if online
    const receiverSocketId = connectedUsers.get(receiverId.toString());
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('receive_message', {
        _id: message.id,
        sender: { _id: sender.id, username: sender.username },
        content: message.content,
        videoUrl: message.videoUrl,
        type: 'video',
        timestamp: message.timestamp
      });
      
      io.to(receiverSocketId).emit('contacts_updated');
    }

    res.json({ 
      message: 'تم رفع ملف الفيديو بنجاح',
      videoUrl: videoUrl
    });
  } catch (error) {
    res.status(500).json({ error: 'خطأ في رفع ملف الفيديو' });
  }
});

// Socket.IO handling
io.on('connection', (socket) => {
  console.log('👤 User connected:', socket.id);

  socket.on('user_connected', async (userId) => {
    connectedUsers.set(userId.toString(), socket.id);
    
    // Update user status in storage
    const user = storage.users.find(u => u.id === parseInt(userId));
    if (user) {
      user.isOnline = true;
      saveData();
    }
    
    // Broadcast to all users that this user is online
    socket.broadcast.emit('user_online', userId);
  });

  socket.on('send_message', async (data) => {
    try {
      const { senderId, receiverId, content } = data;

      // Save message to storage
      const message = {
        id: storage.nextMessageId++,
        sender: parseInt(senderId),
        receiver: parseInt(receiverId),
        content,
        timestamp: new Date(),
        isRead: false
      };

      storage.messages.push(message);
      
      // Auto-add contacts for both sender and receiver if they don't exist
      const senderContact = storage.contacts.find(c => 
        c.userId === parseInt(receiverId) && c.contactId === parseInt(senderId)
      );
      
      if (!senderContact) {
        storage.contacts.push({
          id: storage.nextContactId++,
          userId: parseInt(receiverId),
          contactId: parseInt(senderId),
          addedAt: new Date()
        });
      }

      const receiverContact = storage.contacts.find(c => 
        c.userId === parseInt(senderId) && c.contactId === parseInt(receiverId)
      );
      
      if (!receiverContact) {
        storage.contacts.push({
          id: storage.nextContactId++,
          userId: parseInt(senderId),
          contactId: parseInt(receiverId),
          addedAt: new Date()
        });
      }

      saveData();
      
      // Get sender info
      const sender = storage.users.find(u => u.id === parseInt(senderId));

      // Send to receiver if online (convert to string for Map lookup)
      const receiverSocketId = connectedUsers.get(receiverId.toString());
      if (receiverSocketId) {
        const messageData = {
          _id: message.id,
          sender: { _id: sender.id, username: sender.username },
          content: message.content,
          timestamp: message.timestamp
        };

        // Add media fields if they exist
        if (message.imageUrl) messageData.imageUrl = message.imageUrl;
        if (message.audioUrl) messageData.audioUrl = message.audioUrl;
        if (message.videoUrl) messageData.videoUrl = message.videoUrl;
        if (message.type) messageData.type = message.type;

        io.to(receiverSocketId).emit('receive_message', messageData);
        
        // Also notify to refresh contacts list
        io.to(receiverSocketId).emit('contacts_updated');
      }

      // Send confirmation to sender
      socket.emit('message_sent', {
        _id: message.id,
        sender: { _id: sender.id, username: sender.username },
        content: message.content,
        timestamp: message.timestamp
      });

    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('message_error', 'فشل في إرسال الرسالة');
    }
  });

  socket.on('start_call', async (data) => {
    try {
      const { callerId, receiverId, callType } = data;
      
      // Send call notification to receiver
      const receiverSocketId = connectedUsers.get(receiverId);
      if (receiverSocketId) {
        const caller = storage.users.find(u => u.id === parseInt(callerId));
        io.to(receiverSocketId).emit('incoming_call', {
          callerId: callerId,
          callerName: caller.username,
          callType: callType
        });
      }
    } catch (error) {
      console.error('Error handling call:', error);
    }
  });

  socket.on('accept_call', async (data) => {
    try {
      const { callerId, receiverId, callType } = data;
      
      // Notify caller that call was accepted
      const callerSocketId = connectedUsers.get(callerId);
      if (callerSocketId) {
        io.to(callerSocketId).emit('call_accepted', {
          receiverId: receiverId,
          callType: callType
        });
      }
    } catch (error) {
      console.error('Error accepting call:', error);
    }
  });

  socket.on('reject_call', async (data) => {
    try {
      const { callerId, receiverId } = data;
      
      // Notify caller that call was rejected
      const callerSocketId = connectedUsers.get(callerId);
      if (callerSocketId) {
        io.to(callerSocketId).emit('call_rejected');
      }
    } catch (error) {
      console.error('Error rejecting call:', error);
    }
  });

  socket.on('end_call', async (data) => {
    try {
      const { callerId, receiverId } = data;
      
      // Notify both parties that call ended
      const receiverSocketId = connectedUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('call_ended');
      }
    } catch (error