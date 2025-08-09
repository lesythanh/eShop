import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import Footer from "../components/Layout/Footer";
import Header from "../components/Layout/Header";
import Loader from "../components/Layout/Loader";
import ProductCard from "../components/Route/ProductCard/ProductCard";
import styles from "../styles/styles";

const ProductsPage = () => {
  const [searchParams] = useSearchParams();
  const categoryData = searchParams.get("category");
  const { allProducts, isLoading } = useSelector((state) => state.products);
  const [data, setData] = useState([]);
  const [sortOption, setSortOption] = useState("default");

  useEffect(() => {
    if (categoryData === null) {
      const d = allProducts;
      setData(d);
    } else {
      const d =
        allProducts && allProducts.filter((i) => i.category === categoryData);
      setData(d);
    }
    //    window.scrollTo(0,0);
  }, [allProducts, categoryData]);

  const handleSortChange = (e) => {
    const option = e.target.value;
    setSortOption(option);

    let sortedData = [...data];

    switch (option) {
      case "price-low-to-high":
        sortedData.sort((a, b) => a.discountPrice - b.discountPrice);
        break;
      case "price-high-to-low":
        sortedData.sort((a, b) => b.discountPrice - a.discountPrice);
        break;
      case "newest-first":
        sortedData.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );
        break;
      case "popularity":
        sortedData.sort((a, b) => b.sold_out - a.sold_out);
        break;
      case "rating":
        sortedData.sort((a, b) => b.ratings - a.ratings);
        break;
      default:
      // Keep original sorting
    }

    setData(sortedData);
  };

  return (
    <>
      {isLoading ? (
        <Loader />
      ) : (
        <div className="bg-[#CBA27E]">
          <Header activeHeading={3} />
          <br />
          <br />
          <div className={`${styles.section}`}>
            <div className="w-full flex flex-col items-start mb-5">
              <h1 className="text-3xl font-bold text-gray-900">
                {categoryData ? `Category: ${categoryData}` : "All Products"}
              </h1>
              <div className="w-full flex justify-between items-center mt-5">
                <span className="text-lg text-gray-600">
                  {data && data.length} products found
                </span>
                <div className="flex items-center">
                  <span className="mr-2 text-gray-700">Sort by:</span>
                  <select
                    value={sortOption}
                    onChange={handleSortChange}
                    className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="default">Default</option>
                    <option value="price-low-to-high">Price: Low to High</option>
                    <option value="price-high-to-low">Price: High to Low</option>
                    <option value="newest-first">Newest First</option>
                    <option value="popularity">Popularity</option>
                    <option value="rating">Top Rated</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-[20px] md:grid-cols-2 md:gap-[25px] lg:grid-cols-4 lg:gap-[25px] xl:grid-cols-5 xl:gap-[30px] mb-12">
              {data && data.map((i, index) => <ProductCard data={i} key={index} />)}
            </div>
            {data && data.length === 0 ? (
              <h1 className="text-center w-full pb-[100px] text-[20px]">
                No products Found!
              </h1>
            ) : null}
          </div>
          <Footer />
        </div>
      )}
    </>
  );
};

export default ProductsPage;
