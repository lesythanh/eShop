import axios from "axios";
import React, { useRef, useState } from "react";
import { useEffect } from "react";
import { server } from "../../server";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { AiOutlineArrowRight, AiOutlineSend } from "react-icons/ai";
import styles from "../../styles/styles";
import { TfiGallery } from "react-icons/tfi";
import socketIO from "socket.io-client";
import { format } from "timeago.js";
const ENDPOINT = "http://localhost:4000";
// Improved socket connection with error handling and reconnection options
const socketId = socketIO(ENDPOINT, {
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

const DashboardMessages = () => {
  const { seller } = useSelector((state) => state.seller);
  const [conversations, setConversations] = useState([]);
  const [arrivalMessage, setArrivalMessage] = useState(null);
  const [currentChat, setCurrentChat] = useState();
  const [messages, setMessages] = useState([]);
  const [userData, setUserData] = useState(null);
  const [newMessage, setNewMessage] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [activeStatus, setActiveStatus] = useState(false);
  const [images, setImages] = useState();
  const [open, setOpen] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const navigate = useNavigate();

  // Socket connection status tracking
  useEffect(() => {
    socketId.on("connect", () => {
      console.log("Socket connected successfully");
      setSocketConnected(true);
      setError(null);
    });

    socketId.on("connect_error", (err) => {
      console.log("Socket connection error:", err.message);
      setSocketConnected(false);
      setError("Unable to connect to chat server. Please try again later.");
    });

    socketId.on("disconnect", () => {
      console.log("Socket disconnected");
      setSocketConnected(false);
    });

    return () => {
      socketId.off("connect");
      socketId.off("connect_error");
      socketId.off("disconnect");
    };
  }, []);

  useEffect(() => {
    socketId.on("getMessage", (data) => {
      console.log("Received message:", data);
      setArrivalMessage({
        sender: data.senderId,
        text: data.text || "",
        images: data.images,
        createdAt: data.createdAt || Date.now(),
      });
    });

    return () => {
      socketId.off("getMessage");
    };
  }, []);

  useEffect(() => {
    if (arrivalMessage && currentChat) {
      const isChatMember = currentChat.members.includes(arrivalMessage.sender);
      if (isChatMember) {
        setMessages((prev) => [...prev, arrivalMessage]);
      }
    }
  }, [arrivalMessage, currentChat]);

  useEffect(() => {
    if (seller?._id) {
      const getConversations = async () => {
        try {
          const response = await axios.get(
            `${server}/conversation/get-all-conversation-seller/${seller._id}`,
            { withCredentials: true }
          );
          setConversations(response.data.conversations);
        } catch (error) {
          console.error("Error fetching conversations:", error);
          setError("Failed to load conversations. Please refresh the page.");
        }
      };
      getConversations();
    }
  }, [seller]);

  useEffect(() => {
    if (seller?._id && socketConnected) {
      socketId.emit("addUser", seller._id);
      socketId.on("getUsers", (data) => {
        setOnlineUsers(data);
      });
    }
  }, [seller, socketConnected]);

  const onlineCheck = (chat) => {
    if (!chat.members || !onlineUsers.length) return false;

    const chatMember = chat.members.find((member) => member !== seller?._id);
    return onlineUsers.some((user) => user.userId === chatMember);
  };

  // get messages
  useEffect(() => {
    if (!currentChat) return;

    const getMessages = async () => {
      setLoadingMessages(true);
      try {
        const response = await axios.get(
          `${server}/message/get-all-messages/${currentChat._id}`
        );
        setMessages(response.data.messages);
        setLoadingMessages(false);
      } catch (error) {
        console.error("Error fetching messages:", error);
        setLoadingMessages(false);
        setError("Failed to load messages. Please try again.");
      }
    };
    getMessages();
  }, [currentChat]);

  // create new message
  const sendMessageHandler = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() && !images) return;

    try {
      const receiverId = currentChat.members.find(
        (member) => member !== seller._id
      );

      // Create the message object with the same structure for HTTP and socket
      const messageData = {
        sender: seller._id,
        text: newMessage.trim(),
        conversationId: currentChat._id,
        images: images || null,
      };

      if (socketConnected) {
        console.log("Emitting message via socket:", {
          senderId: seller._id,
          receiverId,
          text: newMessage,
          images: images || null,
        });

        socketId.emit("sendMessage", {
          senderId: seller._id,
          receiverId,
          text: newMessage,
          images: images || null,
        });
      }

      // Send via HTTP regardless of socket status
      const response = await axios.post(
        `${server}/message/create-new-message`,
        messageData
      );

      // Ensure consistent message structure in UI
      const newMsg = {
        ...response.data.message,
        images: response.data.message.images || null,
      };

      setMessages([...messages, newMsg]);
      setNewMessage("");
      setImages(null);
      updateLastMessage();
    } catch (error) {
      console.error("Error sending message:", error);
      setError("Failed to send message. Please try again.");
    }
  };

  const updateLastMessage = async () => {
    try {
      await axios.put(`${server}/conversation/update-last-message/${currentChat._id}`, {
        lastMessage: newMessage,
        lastMessageId: seller._id,
      });
    } catch (error) {
      console.error("Error updating last message:", error);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (reader.readyState === 2) {
        setImages(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const imageSendingHandler = async (e) => {
    e.preventDefault();
    if (!images) return;

    try {
      const receiverId = currentChat.members.find(
        (member) => member !== seller._id
      );

      if (socketConnected) {
        socketId.emit("sendMessage", {
          senderId: seller._id,
          receiverId,
          images,
        });
      }

      const message = {
        sender: seller._id,
        images,
        conversationId: currentChat._id,
      };

      const response = await axios.post(
        `${server}/message/create-new-message`,
        message
      );

      setImages(null);
      setMessages([...messages, response.data.message]);

      await axios.put(`${server}/conversation/update-last-message/${currentChat._id}`, {
        lastMessage: "Photo",
        lastMessageId: seller._id,
      });

    } catch (error) {
      console.error("Error sending image:", error);
      setError("Failed to send image. Please try again.");
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="w-[90%] bg-white m-5 h-[85vh] overflow-y-hidden rounded">
      {error && (
        <div className="w-full h-[40px] flex items-center justify-center bg-red-100 text-red-600">
          {error}
        </div>
      )}

      {!seller ? (
        <div className="w-full h-full flex items-center justify-center">
          <p>Loading...</p>
        </div>
      ) : (
        <div className="w-full h-full flex">
          {/* All conversations */}
          <div className="w-[30%] min-w-[300px] h-full bg-slate-50 border-r overflow-y-scroll">
            <h1 className="text-center text-[20px] font-semibold py-3 border-b">
              All Messages
            </h1>
            {/* All messages list */}
            {conversations && conversations.length > 0 ? (
              conversations.map((conversation, index) => (
                <MessageList
                  key={index}
                  data={conversation}
                  index={index}
                  setOpen={setOpen}
                  setCurrentChat={setCurrentChat}
                  me={seller._id}
                  setUserData={setUserData}
                  online={onlineCheck(conversation)}
                  setActiveStatus={setActiveStatus}
                  isLoading={loadingMessages}
                />
              ))
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <p>No conversations yet</p>
              </div>
            )}
          </div>

          {/* Conversation messages */}
          {open ? (
            <div className="w-[70%] h-full relative">
              <div className="w-full h-[60px] px-3 flex items-center justify-between bg-slate-100 shadow-sm">
                <div className="flex items-center">
                  {userData?.avatar ? (
                    <img
                      src={userData.avatar.url}
                      alt=""
                      className="w-[40px] h-[40px] rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-[40px] h-[40px] rounded-full bg-slate-300 flex items-center justify-center">
                      <span className="text-slate-600 font-semibold">
                        {userData?.name?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="pl-3">
                    <h1 className="text-[18px] font-[600]">{userData?.name}</h1>
                    <h1 className="text-[14px] text-[#000c]">
                      {activeStatus ? "Active Now" : "Offline"}
                    </h1>
                  </div>
                </div>
                <AiOutlineArrowRight
                  size={20}
                  className="cursor-pointer"
                  onClick={() => setOpen(false)}
                />
              </div>

              {/* Messages */}
              <div
                className="h-[calc(100%-120px)] py-3 px-4 overflow-y-scroll"
                ref={scrollRef}
              >
                {loadingMessages ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <p>Loading messages...</p>
                  </div>
                ) : messages && messages.length > 0 ? (
                  messages.map((item, index) => (
                    <div
                      key={index}
                      className={`flex ${item.sender === seller._id ? "justify-end" : "justify-start"
                        } mb-3`}
                    >
                      {item.sender !== seller._id && (
                        <img
                          src={userData?.avatar?.url}
                          alt=""
                          className="w-[35px] h-[35px] rounded-full mr-2 object-cover"
                        />
                      )}
                      <div>
                        {item.text && item.text !== "" && (
                          <div
                            className={`max-w-[300px] px-4 py-2 rounded ${item.sender === seller._id
                              ? "bg-[#2a64e8] text-white"
                              : "bg-[#f0f0f0]"
                              }`}
                          >
                            <p>{item.text}</p>
                          </div>
                        )}
                        {item.images && (
                          <div className="mt-2">
                            <img
                              src={item.images.url || item.images}
                              alt="Message attachment"
                              className="max-w-[300px] max-h-[400px] object-contain rounded"
                              onError={(e) => {
                                console.error("Image failed to load:", item.images);
                                e.target.src = "https://via.placeholder.com/300x200?text=Image+Failed+to+Load";
                              }}
                            />
                          </div>
                        )}
                        <p
                          className={`text-[12px] text-[#aaa] pt-1 ${item.sender === seller._id ? "text-right" : "text-left"
                            }`}
                        >
                          {format(item.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <p>Send a message to start conversation</p>
                  </div>
                )}
              </div>

              {/* Send message input */}
              <form
                onSubmit={sendMessageHandler}
                className="absolute bottom-0 left-0 w-full h-[60px] flex items-center bg-white border-t p-3"
              >
                <div className="w-full flex items-center">
                  <div className="flex relative w-full">
                    <input
                      type="text"
                      required
                      placeholder="Enter your message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      className="w-full px-3 py-2 border rounded-l-md focus:outline-none"
                    />
                    {images && (
                      <div className="absolute left-1 top-1 w-[95px] h-[95px] z-10 cursor-pointer">
                        <div className="relative">
                          <img
                            src={images}
                            alt=""
                            className="w-full h-full object-contain"
                          />
                          <div
                            className="absolute top-[2px] right-[2px] w-[20px] h-[20px] rounded-full bg-[#00000065] flex items-center justify-center cursor-pointer"
                            onClick={() => setImages(null)}
                          >
                            <span className="text-white">×</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center">
                    <label htmlFor="image-upload">
                      <TfiGallery
                        size={24}
                        className="cursor-pointer mx-2 text-[#0095f6]"
                      />
                    </label>
                    <input
                      type="file"
                      id="image-upload"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <button
                      type="submit"
                      className="bg-[#0095f6] text-white px-4 py-2 rounded-r-md"
                    >
                      <AiOutlineSend size={20} />
                    </button>
                  </div>
                </div>
              </form>
            </div>
          ) : (
            <div className="w-[70%] h-full flex items-center justify-center">
              <p>Select a conversation to start messaging</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const MessageList = ({
  data,
  index,
  setOpen,
  setCurrentChat,
  me,
  setUserData,
  online,
  setActiveStatus,
  isLoading
}) => {
  const [user, setUser] = useState({});
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const userId = data.members.find((id) => id !== me);
    if (!userId) return;

    const getUser = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${server}/user/user-info/${userId}`);
        setUser(res.data.user);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching user:", error);
        setLoading(false);
      }
    };
    getUser();
  }, [me, data]);

  const handleClick = () => {
    setOpen(true);
    setCurrentChat(data);
    setUserData(user);
    setActiveStatus(online);
  };

  return (
    <div
      className={`w-full flex p-3 px-4 items-center border-b cursor-pointer hover:bg-slate-100 transition-all`}
      onClick={handleClick}
    >
      <div className="relative">
        {loading ? (
          <div className="w-[40px] h-[40px] rounded-full bg-slate-300"></div>
        ) : (
          <>
            {user?.avatar ? (
              <img
                src={user.avatar.url}
                alt=""
                className="w-[40px] h-[40px] rounded-full object-cover"
              />
            ) : (
              <div className="w-[40px] h-[40px] rounded-full bg-slate-300 flex items-center justify-center">
                <span className="text-slate-600 font-semibold">
                  {user?.name?.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            {online && (
              <div className="w-[12px] h-[12px] bg-green-500 rounded-full absolute top-0 right-0"></div>
            )}
          </>
        )}
      </div>
      <div className="pl-3 flex-1">
        <h1 className="text-[16px] font-[500]">{user?.name || "Loading..."}</h1>
        <p className="text-[14px] text-[#000c] truncate w-full max-w-[150px]">
          {!isLoading && data.lastMessage ?
            data.lastMessageId === me ? "You: " + data.lastMessage : data.lastMessage
            : "Start a conversation"}
        </p>
      </div>
    </div>
  );
};

export default DashboardMessages;
