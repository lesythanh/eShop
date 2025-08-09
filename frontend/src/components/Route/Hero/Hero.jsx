import React from "react";
import { Link } from "react-router-dom";
import styles from "../../../styles/styles";

const Hero = () => {
  return (
    <div
      className={`relative min-h-[70vh] 800px:min-h-[80vh] w-full bg-no-repeat bg-cover bg-center ${styles.noramlFlex}`}
      style={{
        backgroundImage:
          "url(https://www.highlandscoffee.com.vn/vnt_upload/weblink/2025/HCO_7798_COCO_FAMILY_DIGITAL_WEB_BANNER_1470x461.png)",
      }}
    >
      {/* TODO: Banner info */}
      {/* <div className={`${styles.section} w-[90%] 800px:w-[60%]`}>
        <h1
          className={`text-[35px] leading-[1.2] 800px:text-[60px] text-[#38406c] font-[600] capitalize`}
        >
          Best Collection for <br /> Coffee Chill
        </h1>
        <p className="pt-5 text-[16px] font-[Poppins] font-[400] text-[#38406c]">
          Enjoy the rich, authentic taste of premium coffee.{" "}
          <br /> We bring you freshly brewed cups in a warm and cozy space to start your day with inspiration.
        </p>
        <Link to="/products" className="inline-block">
            <div className={`${styles.button} mt-5`}>
                 <span className="text-[#fff] font-[Poppins] text-[18px]">
                    Shop Now
                 </span>
            </div>
        </Link>
      </div> */}
    </div>
  );
};

export default Hero;
