import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import styles from "../../styles/styles";
import ProductCard from "../Route/ProductCard/ProductCard";

const SuggestedProduct = ({ data }) => {
  const { allProducts } = useSelector((state) => state.products);
  const [products, setProducts] = useState(null);

  useEffect(() => {
    if (data && allProducts) {
      const suggestedProducts = allProducts.filter(
        (i) => i.category === data.category && i._id !== data._id
      );
      setProducts(suggestedProducts.slice(0, 8));
    }
  }, [allProducts, data]);

  return (
    <div>
      {data && products && products.length > 0 && (
        <div className={`${styles.section} p-4`}>
          <div className={`${styles.heading}`}>
            <h1>Related Products</h1>
          </div>
          <div className="grid grid-cols-1 gap-[20px] md:grid-cols-2 md:gap-[25px] lg:grid-cols-3 lg:gap-[25px] xl:grid-cols-4 xl:gap-[30px] mb-12">
            {products &&
              products.map((i, index) => <ProductCard data={i} key={index} />)}
          </div>
        </div>
      )}
    </div>
  );
};

export default SuggestedProduct;
