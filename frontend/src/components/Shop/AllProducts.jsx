import { Button } from "@material-ui/core";
import { DataGrid } from "@material-ui/data-grid";
import React, { useEffect } from "react";
import { AiOutlineDelete, AiOutlineEye } from "react-icons/ai";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { getAllProductsShop } from "../../redux/actions/product";
import { deleteProduct } from "../../redux/actions/product";
import Loader from "../Layout/Loader";
import { toast } from "react-toastify";

const AllProducts = () => {
  const { products, isLoading, error, message } = useSelector((state) => state.products);
  const { seller } = useSelector((state) => state.seller);

  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(getAllProductsShop(seller._id));
  }, [dispatch, seller._id]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      dispatch({ type: "clearErrors" });
    }

  }, [dispatch, error, seller._id]);

  const isProductInLocalStorageCarts = (productId) => {
    try {
      const cartItems = localStorage.getItem("cartItems");

      if (cartItems) {
        const parsedCart = JSON.parse(cartItems);
        return parsedCart.some(item => item._id === productId);
      }

      return false;
    } catch (error) {
      console.log("Error checking localStorage cart:", error);
      return false;
    }
  };

  const handleDelete = async (id) => {
    if (isProductInLocalStorageCarts(id)) {
      toast.error("Cannot delete this product as it's currently in a user's shopping cart. Please wait for the user to complete their purchase or remove it from cart.");
      return;
    }

    if (window.confirm("Are you sure you want to delete this product?")) {
      try {
        await dispatch(deleteProduct(id));
        toast.success("Product deleted successfully!");
        dispatch(getAllProductsShop(seller._id));
        dispatch({ type: "clearErrors" });
      } catch (error) {
        const errorMessage = error.response?.data?.message || "Failed to delete product";

        if (errorMessage.includes("currently in users' carts")) {
          toast.error("Cannot delete this product as it's currently in users' shopping carts. Please wait for customers to complete their purchases.");
        } else {
          toast.error(errorMessage);
        }
      }
    }
  };

  const columns = [
    { field: "id", headerName: "Product Id", minWidth: 150, flex: 0.7 },
    {
      field: "name",
      headerName: "Name",
      minWidth: 180,
      flex: 1.4,
    },
    {
      field: "price",
      headerName: "Price",
      minWidth: 100,
      flex: 0.6,
    },
    {
      field: "Stock",
      headerName: "Stock",
      type: "number",
      minWidth: 80,
      flex: 0.5,
    },

    {
      field: "sold",
      headerName: "Sold out",
      type: "number",
      minWidth: 130,
      flex: 0.6,
    },
    {
      field: "Preview",
      flex: 0.8,
      minWidth: 100,
      headerName: "",
      type: "number",
      sortable: false,
      renderCell: (params) => {
        return (
          <>
            <Link to={`/product/${params.id}`}>
              <Button>
                <AiOutlineEye size={20} />
              </Button>
            </Link>
          </>
        );
      },
    },
    {
      field: "Delete",
      flex: 0.8,
      minWidth: 120,
      headerName: "",
      type: "number",
      sortable: false,
      renderCell: (params) => {
        return (
          <>
            <Button onClick={() => handleDelete(params.id)}>
              <AiOutlineDelete size={20} />
            </Button>
          </>
        );
      },
    },
  ];

  const row = [];

  products &&
    products.forEach((item) => {
      row.push({
        id: item._id,
        name: item.name,
        price: item.discountPrice + " VNĐ",
        Stock: item.stock,
        sold: item?.sold_out,
      });
    });

  return (
    <>
      {isLoading ? (
        <Loader />
      ) : (
        <div className="w-full mx-8 pt-1 mt-10 bg-white">
          <DataGrid
            rows={row}
            columns={columns}
            pageSize={10}
            disableSelectionOnClick
            autoHeight
          />
        </div>
      )}
    </>
  );
};

export default AllProducts;
