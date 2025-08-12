import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import axios from 'axios';
import { server } from '../server';

const GoogleLoginButton = ({ onSuccess }) => {
  const navigate = useNavigate();

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const result = await axios.post(
        `${server}/user/google-login`,
        { token: credentialResponse.credential },
        { withCredentials: true }
      );

      if (result.data.success) {
        toast.success("Google login successful!");
        if (onSuccess) onSuccess(result.data.user);
        navigate("/");
        window.location.reload(true);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Google login failed");
    }
  };

  const handleGoogleError = () => {
    toast.error("Google login failed. Please try again.");
  };

  return (
    <div className="w-full">
      <GoogleLogin
        onSuccess={handleGoogleSuccess}
        onError={handleGoogleError}
        theme="outline"
        size="large"
        width="100%"
        text="continue_with"
      />
    </div>
  );
};

export default GoogleLoginButton;
