import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import Footer from "../components/Layout/Footer";
import Header from "../components/Layout/Header";
import ProductDetails from "../components/Products/ProductDetails";
import SuggestedProduct from "../components/Products/SuggestedProduct";
import { useSelector } from "react-redux";
import Loader from "../components/Layout/Loader";

const ProductDetailsPage = () => {
  const { allProducts } = useSelector((state) => state.products);
  const { allEvents } = useSelector((state) => state.events);
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [searchParams] = useSearchParams();
  const eventData = searchParams.get("isEvent");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    if (eventData !== null) {
      const data = allEvents && allEvents.find((i) => i._id === id);
      setData(data);
    } else {
      const data = allProducts && allProducts.find((i) => i._id === id);
      setData(data);
    }
    setLoading(false);
  }, [allProducts, allEvents, id, eventData]);

  return (
    <div className="bg-[#CBA27E] min-h-screen flex flex-col">
      <Header />
      <div className="flex-grow">
        {loading ? (
          <div className="w-full h-screen flex justify-center items-center">
            <Loader />
          </div>
        ) : (
          <>
            <ProductDetails data={data} />
            {!eventData && data && (
              <div className="px-2 md:px-0">
                <SuggestedProduct data={data} />
              </div>
            )}
          </>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default ProductDetailsPage;
