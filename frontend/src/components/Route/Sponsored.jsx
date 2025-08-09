import React from "react";
import styles from "../../styles/styles";
import appleIcon from "../../Assests/icons/pngimg.com - apple_logo_PNG19688.png";

const Sponsored = () => {
  return (
    <div
      className={`${styles.section} hidden sm:block bg-white py-10 px-5 mb-12 cursor-pointer rounded-xl`}
    >
      <div className="flex justify-between w-full">
        <div className="flex items-start">
          <img
            src="https://spencil.vn/wp-content/uploads/2024/06/mau-thiet-ke-logo-thuong-hieu-cafe-SPencil-Agency-6-1024x849.jpeg"
            alt=""
            style={{width:"150px", objectFit:"contain"}}
          />
        </div>
        <div className="flex items-start">
          <img
            src="https://noithattruongsa.com/wp-content/uploads/2023/02/logo-quan-cafe-35.jpg"
            style={{width:"150px", objectFit:"contain"}}
            alt=""
          />
        </div>
        <div className="flex items-start">
          <img
            src="https://voucherbox.vn/wp-content/uploads/2022/11/Logo-HighLands-Coffee.webp"
            style={{width:"150px", objectFit:"contain"}}
            alt=""
          />
        </div>
        <div className="flex items-start">
          <img
            src="https://spencil.vn/wp-content/uploads/2024/06/mau-thiet-ke-logo-thuong-hieu-cafe-SPencil-Agency-7-1024x768.png"
            style={{width:"150px", objectFit:"contain"}}
            alt=""
          />
        </div>
        <div className="flex items-start">
          <img
            src="https://mcm.com.vn/storage/app/uploads/public/5c2/327/716/5c2327716df04667379463.jpg"
            style={{width:"150px", objectFit:"contain"}}
            alt=""
          />
        </div>
      </div>
    </div>
  );
};

export default Sponsored;
