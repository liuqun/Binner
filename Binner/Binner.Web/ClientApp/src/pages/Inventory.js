import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation, Trans } from 'react-i18next';
import ReactDOM from "react-dom";
import PropTypes from "prop-types";
import { useFocus } from "../hooks/useFocus";
import _ from "underscore";
import debounce from "lodash.debounce";
import {
  Icon,
  Input,
  Label,
  Button,
  TextArea,
  Image,
  Form,
  Table,
  Segment,
  Popup,
  Modal,
  Dimmer,
  Loader,
  Header,
  Confirm,
  Grid,
  Card,
  Menu,
  Placeholder,
  Flag,
  Checkbox,
  Dropdown
} from "semantic-ui-react";
import Carousel from "react-bootstrap/Carousel";
import NumberPicker from "../components/NumberPicker";
import PartTypeSelector from "../components/PartTypeSelector";
import { FormHeader } from "../components/FormHeader";
import { ChooseAlternatePartModal } from "../components/ChooseAlternatePartModal";
import Dropzone from "../components/Dropzone";
import { ProjectColors } from "../common/Types";
import { fetchApi } from "../common/fetchApi";
import { formatCurrency, formatNumber, getCurrencySymbol } from "../common/Utils";
import { toast } from "react-toastify";
import { getPartTypeId } from "../common/partTypes";
import axios from "axios";
import { getAuthToken, getImagesToken } from "../common/authentication";
import { StoredFileType } from "../common/StoredFileType";
import { GetTypeName, GetTypeValue, GetAdvancedTypeDropdown } from "../common/Types";
import { BarcodeScannerInput } from "../components/BarcodeScannerInput";
import { Currencies } from "../common/currency";
import "./Inventory.css";

const ProductImageIntervalMs = 10 * 1000;
const IcPartType = 14;

export function Inventory(props) {
  const maxRecentAddedParts = 10;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const defaultViewPreferences = JSON.parse(localStorage.getItem("viewPreferences")) || {
    helpDisabled: false,
    lastPartTypeId: IcPartType, // IC
    lastMountingTypeId: "0", // None
    lastQuantity: 1,
    lastProjectId: null,
    lastLocation: "",
    lastBinNumber: "",
    lastBinNumber2: "",
    lowStockThreshold: 10,
    rememberLast: true
  };

  const [inputPartNumber, setInputPartNumber] = useState("");
  const [suggestedPartNumber, setSuggestedPartNumber] = useState(null);
  const [viewPreferences, setViewPreferences] = useState(defaultViewPreferences);
  const [infoResponse, setInfoResponse] = useState({});
  const [datasheetTitle, setDatasheetTitle] = useState("");
  const [datasheetPartName, setDatasheetPartName] = useState("");
  const [datasheetDescription, setDatasheetDescription] = useState("");
  const [datasheetManufacturer, setDatasheetManufacturer] = useState("");
  const scannedPartsSerialized = JSON.parse(localStorage.getItem("scannedPartsSerialized")) || [];
  const hasParameters = (props.params && props.params.partNumber !== undefined && props.params.partNumber.length > 0);
  const defaultPart = {
    partId: 0,
    partNumber: props.params.partNumber || "",
    allowPotentialDuplicate: false,
    quantity: (!hasParameters && viewPreferences.rememberLast && viewPreferences.lastQuantity) + "",
    lowStockThreshold: (!hasParameters && viewPreferences.rememberLast && viewPreferences.lowStockThreshold) + "",
    partTypeId: (!hasParameters && viewPreferences.rememberLast && (viewPreferences.lastPartTypeId || IcPartType)) || 0 ,
    mountingTypeId: (!hasParameters && viewPreferences.rememberLast && viewPreferences.lastMountingTypeId) || 0 + "",
    packageType: "",
    keywords: "",
    description: "",
    datasheetUrl: "",
    digiKeyPartNumber: "",
    mouserPartNumber: "",
    arrowPartNumber: "",
    location: (!hasParameters && viewPreferences.rememberLast && viewPreferences.lastLocation) || "",
    binNumber: (!hasParameters && viewPreferences.rememberLast && viewPreferences.lastBinNumber) || "",
    binNumber2: (!hasParameters && viewPreferences.rememberLast && viewPreferences.lastBinNumber2) || "",
    cost: "",
    lowestCostSupplier: "",
    lowestCostSupplierUrl: "",
    productUrl: "",
    manufacturer: "",
    manufacturerPartNumber: "",
    imageUrl: "",
    projectId: "",
    supplier: "",
    supplierPartNumber: "",
    storedFiles: []
  };

  const defaultPartSupplier = { name: '', supplierPartNumber: '', cost: '0', quantityAvailable: '0', minimumOrderQuantity: '0', productUrl: '', imageUrl: ''};
  const defaultMountingTypes = [
    {
      key: 0,
      value: "0", /** using strings here because semantic doesnt allow selection of value=0 */
      text: "None"
    },
    {
      key: 1,
      value: "1",
      text: "Through Hole"
    },
    {
      key: 2,
      value: "2",
      text: "Surface Mount"
    }
  ];

  const [parts, setParts] = useState([]);
  const [part, setPart] = useState(defaultPart);
  const [isEditing, setIsEditing] = useState((part && part.partId > 0) || hasParameters);
  const [isDirty, setIsDirty] = useState(false);
  const [selectedPart, setSelectedPart] = useState(null);
  const [selectedLocalFile, setSelectedLocalFile] = useState(null);
  const [recentParts, setRecentParts] = useState([]);
  const [metadataParts, setMetadataParts] = useState([]);
  const [duplicateParts, setDuplicateParts] = useState([]);
  const [scannedParts, setScannedParts] = useState(scannedPartsSerialized);
  const [highlightScannedPart, setHighlightScannedPart] = useState(null);
  const [partModalOpen, setPartModalOpen] = useState(false);
  const [duplicatePartModalOpen, setDuplicatePartModalOpen] = useState(false);
  const [confirmDeleteIsOpen, setConfirmDeleteIsOpen] = useState(false);
  const [confirmPartDeleteContent, setConfirmPartDeleteContent] = useState(null);
  const [confirmLocalFileDeleteContent, setConfirmLocalFileDeleteContent] = useState(null);
  const [confirmDeleteLocalFileIsOpen, setConfirmDeleteLocalFileIsOpen] = useState(false);
  const [partTypes, setPartTypes] = useState([]);
  const [allPartTypes, setAllPartTypes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [mountingTypes] = useState(defaultMountingTypes);
  const [loadingPartMetadata, setLoadingPartMetadata] = useState(true);
  const [loadingPartTypes, setLoadingPartTypes] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [partMetadataIsSubscribed, setPartMetadataIsSubscribed] = useState(false);
  const [partMetadataError, setPartMetadataError] = useState(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [isKeyboardListening, setIsKeyboardListening] = useState(true);
  const [keyboardPassThrough, setKeyboardPassThrough] = useState(null);
  const [showBarcodeBeingScanned, setShowBarcodeBeingScanned] = useState(false);
  const [bulkScanSaving, setBulkScanSaving] = useState(false);
  const [bulkScanIsOpen, setBulkScanIsOpen] = useState(false);
  const [error, setError] = useState(null);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragOverClass, setDragOverClass] = useState("");
  const [partInputPartNumberRef, setInputPartNumberFocus] = useFocus();
  const [showAddPartSupplier, setShowAddPartSupplier] = useState(false);
  const [partSupplier, setPartSupplier] = useState(defaultPartSupplier);
  const [partExistsInInventory, setPartExistsInInventory] = useState(false);
  const currencyOptions = GetAdvancedTypeDropdown(Currencies, true);

  // todo: find a better alternative, we shouldn't need to do this!
  const bulkScanIsOpenRef = useRef();
  bulkScanIsOpenRef.current = bulkScanIsOpen;
  const scannedPartsRef = useRef();
  scannedPartsRef.current = scannedParts;
  const partTypesRef = useRef();
  partTypesRef.current = partTypes;

  useEffect(() => {
    const partNumberStr = props.params.partNumber;
    setIsEditing((props.params && props.params.partNumber !== undefined && props.params.partNumber.length > 0));
    const fetchData = async () => {
      setPartMetadataIsSubscribed(false);
      setPartMetadataError(null);
      await fetchPartTypes();
      await fetchProjects();
      await fetchRecentRows();
      if (partNumberStr) {
        var loadedPart = await fetchPart(partNumberStr);
        if (isEditing) setInputPartNumber(partNumberStr);
        await fetchPartMetadata(partNumberStr, loadedPart || part);
      } else {
        resetForm();
      }
    };
    fetchData().catch(console.error);
    return () => {
      searchDebounced.cancel();
    };
  }, [props.params.partNumber]);

  const fetchPartMetadata = async (input, part) => {
    if (partTypesRef.current.length === 0)
      console.error("There are no partTypes! This shouldn't happen and is a bug.");
    Inventory.infoAbortController.abort();
    Inventory.infoAbortController = new AbortController();
    setLoadingPartMetadata(true);
    setPartMetadataIsSubscribed(false);
    setPartMetadataError(null);
    try {
      const response = await fetchApi(`api/part/info?partNumber=${input}&supplierPartNumbers=digikey:${part.digiKeyPartNumber || ""},mouser:${part.mouserPartNumber || ""},arrow:${part.arrowPartNumber}`, {
        signal: Inventory.infoAbortController.signal
      });

      if (!hasParameters) {
        // also check inventory for this part
        const existsResponse = await fetchApi(`api/part/search?keywords=${input}&exactMatch=true`, {
          signal: Inventory.infoAbortController.signal,
          catchErrors: true
        });
        if(existsResponse.responseObject.ok && existsResponse.data !== null) {
          setPartExistsInInventory(true);
        }
      }

      const data = response.data;
      if (data.requiresAuthentication) {
        // redirect for authentication
        window.open(data.redirectUrl, "_blank");
        return;
      }

      if (data.errors && data.errors.length > 0) {
        setPartMetadataError(`Error: [${data.apiName}] ${data.errors.join()}`);
        return;
      }

      let metadataParts = [];
      const infoResponse = mergeInfoResponse(data.response, part.storedFiles);
      if (infoResponse && infoResponse.parts && infoResponse.parts.length > 0) {
        metadataParts = infoResponse.parts;

        const suggestedPart = infoResponse.parts[0];
        // populate the form with data from the part metadata
        if(!hasParameters) setPartFromMetadata(metadataParts, suggestedPart);
      } else {
        // no part metadata available
        setPartMetadataIsSubscribed(true);
      }

      // set the first datasheet meta display, because the carousel component doesnt fire the first event
      if (infoResponse && infoResponse.datasheets && infoResponse.datasheets.length > 0) setDatasheetMeta(infoResponse.datasheets[0]);

      setInfoResponse(infoResponse);
      setMetadataParts(metadataParts);
      setLoadingPartMetadata(false);
    } catch (ex) {
      console.error("Exception", ex);
      if (ex.name === "AbortError") {
        return; // Continuation logic has already been skipped, so return normally
      }
      throw ex;
    }
  };

  const getPartMetadata = async (input, part) => {
    if (partTypesRef.current.length === 0)
      console.error("There are no partTypes! This shouldn't happen and is a bug.");
    Inventory.infoAbortController.abort();
    Inventory.infoAbortController = new AbortController();
    try {
      const response = await fetchApi(`api/part/info?partNumber=${input}&partTypeId=${part.partTypeId || "0"}&mountingTypeId=${part.mountingTypeId || "0"}&supplierPartNumbers=digikey:${part.digiKeyPartNumber || ""},mouser:${part.mouserPartNumber || ""},arrow:${part.arrowPartNumber}`, {
        signal: Inventory.infoAbortController.signal
      });
      const data = response.data;
      if (data.requiresAuthentication) {
        // redirect for authentication
        window.open(data.redirectUrl, "_blank");
        return;
      }

      if (data.errors && data.errors.length > 0) {
        setPartMetadataError(`Error: [${data.apiName}] ${data.errors.join()}`);
        return;
      }

      return data;

    } catch (ex) {
      console.error("Exception", ex);
      if (ex.name === "AbortError") {
        return; // Continuation logic has already been skipped, so return normally
      }
      throw ex;
    }
  };

  const searchDebounced = useMemo(() => debounce(fetchPartMetadata, 1000), [hasParameters]);

  const onUploadSubmit = async (uploadFiles, type) => {
    setUploading(true);
    if (!part.partId) {
      toast.warn(t('message.uploadWait', "Files can't be uploaded until the part is saved."));
      return;
    }
    if (uploadFiles && uploadFiles.length > 0) {
      const requestData = new FormData();
      requestData.append("partId", part.partId);
      requestData.append("storedFileType", GetTypeValue(StoredFileType, type));
      for (let i = 0; i < uploadFiles.length; i++) requestData.append("files", uploadFiles[i], uploadFiles[i].name);

      // first fetch some data using fetchApi, to leverage 401 token refresh
      fetchApi("api/authentication/identity").then((_) => {
      axios
        .request({
          method: "post",
          url: `api/storedFile`,
          data: requestData,
          headers: { Authorization: `Bearer ${getAuthToken()}` }
        })
        .then((response) => {
          const { data } = response;
          let errorMessage;
          toast.dismiss();
          if (data.errors && data.errors.length > 0) {
            errorMessage = data.errors.map((err, key) => <li key={key}>{err.message}</li>);
            toast.error(t('message.uploadFailed', "Failed to upload file!"), { autoClose: 10000 });
            setError(<ul className="errors">{errorMessage}</ul>);
          } else {
            // success uploading
            if (uploadFiles.length === 1) toast.success(t('message.uploadSuccess', "File uploaded."));
            else toast.success(t('message.uploadSuccessX', "{{count}} files uploaded.", {count: uploadFiles.length}));

            // add it to the local data
            var typeValue = GetTypeValue(StoredFileType, type);
            var i = 0;
            switch (typeValue) {
              case StoredFileType.ProductImage:
                const productImages = [...infoResponse.productImages];
                for (i = 0; i < data.length; i++) {
                  productImages.unshift({
                    name: data[i].originalFileName,
                    value: `/api/storedFile/preview?fileName=${data[i].fileName}&token=${getImagesToken()}`,
                    id: data[i].storedFileId
                  });
                }
                setInfoResponse({ ...infoResponse, productImages });
                break;
              case StoredFileType.Datasheet:
                const datasheets = [...infoResponse.datasheets];
                for (i = 0; i < data.length; i++) {
                  const datasheet = {
                    name: data[i].originalFileName,
                    value: {
                      datasheetUrl: `/api/storedFile/local?fileName=${data[i].fileName}&token=${getImagesToken()}`,
                      description: data[i].originalFileName,
                      imageUrl: `/api/storedFile/preview?fileName=${data[i].fileName}&token=${getImagesToken()}`,
                      manufacturer: "",
                      title: data[i].originalFileName
                    },
                    id: data[i].storedFileId
                  };
                  datasheets.unshift(datasheet);
                  setDatasheetMeta(datasheet);
                }
                setInfoResponse({ ...infoResponse, datasheets });
                break;
              case StoredFileType.Pinout:
                const pinoutImages = [...infoResponse.pinoutImages];
                for (i = 0; i < data.length; i++) {
                  pinoutImages.unshift({
                    name: data[i].originalFileName,
                    value: `/api/storedFile/preview?fileName=${data[i].fileName}&token=${getImagesToken()}`,
                    id: data[i].storedFileId
                  });
                }
                setInfoResponse({ ...infoResponse, pinoutImages });
                break;
              case StoredFileType.ReferenceDesign:
                const circuitImages = [...infoResponse.circuitImages];
                for (i = 0; i < data.length; i++) {
                  circuitImages.unshift({
                    name: data[i].originalFileName,
                    value: `/api/storedFile/preview?fileName=${data[i].fileName}&token=${getImagesToken()}`,
                    id: data[i].storedFileId
                  });
                }
                setInfoResponse({ ...infoResponse, circuitImages });
                break;
              default:
            }

            setError(null);
            setIsDirty(false);
          }
          setUploading(false);
          setFiles([]);
        })
        .catch((error) => {
          toast.dismiss();
          console.error("error", error);
          if (error.code === "ERR_NETWORK") {
            const msg = t('message.unableToUpload', "Unable to upload. Check that the file is not locked or deleted.");
            toast.error(msg, { autoClose: 10000 });
            setError(msg);
          } else {
            toast.error(t('message.uploadFailed', "Failed to upload file!"));
            setError(error.message);
          }
          setIsDirty(false);
          setUploading(false);
          setFiles([]);
        });
      });
    } else {
      toast.error(t('message.noFilesSelected', "No files selected for upload!"));
    }
  };

  const onUploadError = (errors) => {
    for (let i = 0; i < errors.length; i++) toast.error(errors[i], { autoClose: 10000 });
  };

  // for processing barcode scanner input
  const handleBarcodeInput = (e, input) => {
    if (!input.value) return;

    // really important: reset the keyboard passthrough or scan results will be unreliable
    setKeyboardPassThrough(null);

    let cleanPartNumber = "";
    if (input.type === "datamatrix") {
      if (input.value.mfgPartNumber && input.value.mfgPartNumber.length > 0) cleanPartNumber = input.value.mfgPartNumber;
      else if (input.value.description && input.value.description.length > 0) cleanPartNumber = input.value.description;
    } else if (input.type === "code128") {
      cleanPartNumber = input.value;
    }

    if (!cleanPartNumber) return;

    // add part
    if (bulkScanIsOpenRef.current) {
      // bulk scan add part
      const lastPart = _.last(scannedParts);
      const scannedPart = {
        partNumber: cleanPartNumber,
        quantity: parseInt(input.value.quantity || "1"),
        scannedQuantity: parseInt(input.value.quantity || "1"),
        location: (lastPart && lastPart.location) || "",
        binNumber: (lastPart && lastPart.binNumber) || "",
        binNumber2: (lastPart && lastPart.binNumber2) || "",
        origin: (input.value.countryOfOrigin && input.value.countryOfOrigin.toLowerCase()) || "",
        description: input.value.description || "",
        barcode: input.correctedValue
      };
      const existingPartNumber = _.find(scannedPartsRef.current, { partNumber: cleanPartNumber });
      if (existingPartNumber) {
        // console.log('existing part number found in scanned parts', existingPartNumber, cleanPartNumber);
        existingPartNumber.quantity += existingPartNumber.scannedQuantity || 1;
        localStorage.setItem("scannedPartsSerialized", JSON.stringify(scannedPartsRef.current));
        setShowBarcodeBeingScanned(false);
        setHighlightScannedPart(existingPartNumber);
        setScannedParts([...scannedPartsRef.current]);
      } else {
        // fetch metadata on the barcode, don't await, do a background update
        const newScannedParts = [...scannedPartsRef.current, scannedPart];
        localStorage.setItem("scannedPartsSerialized", JSON.stringify(newScannedParts));
        setShowBarcodeBeingScanned(false);
        setHighlightScannedPart(scannedPart);
        setScannedParts(newScannedParts);

        fetchBarcodeMetadata(e, scannedPart, (partInfo) => {
          // barcode found
          const newScannedParts = [...scannedPartsRef.current];
          const scannedPartIndex = _.findIndex(newScannedParts, i => i.partNumber === partInfo.manufacturerPartNumber || i.barcode === scannedPart.barcode);
          if (scannedPartIndex >= 0) {
            const scannedPart = newScannedParts[scannedPartIndex];
            scannedPart.description = partInfo.description;
            if (partInfo.basePartNumber && partInfo.basePartNumber.length > 0)
              scannedPart.partNumber = partInfo.basePartNumber;
            newScannedParts[scannedPartIndex] = scannedPart;
            setScannedParts(newScannedParts);
            localStorage.setItem("scannedPartsSerialized", JSON.stringify(newScannedParts));
          }
        }, (scannedPart) => {
          // no barcode info found, try searching the part number
          //searchDebounced(scannedPart.partNumber, scannedPart);
          // console.log('no barcode found, getting partInfo');
          getPartMetadata(scannedPart.partNumber, scannedPart).then((data) => {
            // console.log('partInfo received', data);
            if (data.response.parts.length > 0) {
              const firstPart = data.response.parts[0];
              // console.log('adding part', firstPart);
              const newScannedParts = [...scannedPartsRef.current];
              const scannedPartIndex = _.findIndex(newScannedParts, i => i.partNumber === firstPart.manufacturerPartNumber || i.barcode === scannedPart.barcode);
              if (scannedPartIndex >= 0) {
                const scannedPart = newScannedParts[scannedPartIndex];
                scannedPart.description = firstPart.description;
                if (firstPart.basePartNumber && firstPart.basePartNumber.length > 0)
                  scannedPart.partNumber = firstPart.basePartNumber;
                newScannedParts[scannedPartIndex] = scannedPart;
                setScannedParts(newScannedParts);
                localStorage.setItem("scannedPartsSerialized", JSON.stringify(newScannedParts));
              }
            }
          });
        });
      }
    } else {
      // scan single part
      // console.log('bulk scan is NOT open', cleanPartNumber);
      // fetch metadata on the barcode, don't await, do a background update
      const scannedPart = {
        partNumber: cleanPartNumber,
        barcode: input.correctedValue
      };
      setInputPartNumber(cleanPartNumber);
      fetchBarcodeMetadata(e, scannedPart, (partInfo) => {
        // barcode found
        // console.log("Barcode info found!", partInfo);
        if (cleanPartNumber) {
          setPartMetadataIsSubscribed(false);
          setPartMetadataError(null);
          if(!isEditing) setPartFromMetadata(metadataParts, { ...partInfo, barcodeQuantity: partInfo.quantityAvailable });
          if (viewPreferences.rememberLast) updateViewPreferences({lastQuantity: partInfo.quantityAvailable});
          setShowBarcodeBeingScanned(false);

          // also run a search to get datasheets/images
          searchDebounced(cleanPartNumber, part);
          setIsDirty(true);
        }
      }, (scannedPart) => {
        // console.log("No barcode info found, searching part number");
        // no barcode info found, try searching the part number
        if (cleanPartNumber) {
          setPartMetadataIsSubscribed(false);
          setPartMetadataError(null);
          const newPart = {...part, 
            partNumber: cleanPartNumber, 
            quantity: parseInt(input.value?.quantity || "1"),
            partTypeId: -1,
            mountingTypeId: "-1",
          };
          setPart(newPart);
          if (viewPreferences.rememberLast) updateViewPreferences({lastQuantity: newPart.quantity});
          setShowBarcodeBeingScanned(false);
          searchDebounced(cleanPartNumber, newPart);
          setIsDirty(true);
        }
      }); 
    }
  };

  const fetchBarcodeMetadata = async (e, scannedPart, onSuccess, onFailure) => {
    e.preventDefault();
    e.stopPropagation();
    const response = await fetchApi(`api/part/barcode/info?barcode=${scannedPart.barcode}&token=${getImagesToken()}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    });
    if (response.responseObject.status === 200) {
      const { data } = response;
      if (data.requiresAuthentication) {
        // redirect for authentication
        window.open(data.redirectUrl, "_blank");
        return;
      }
      if (data.response.parts.length > 0) {
        // show the metadata in the UI
        var partInfo =  data.response.parts[0];
        onSuccess(partInfo);
      }else {
        // no barcode found
        onFailure(scannedPart);
      }
    }
  };

  const enableKeyboardListening = () => {
    setIsKeyboardListening(true);
  };

  const disableKeyboardListening = () => {
    setIsKeyboardListening(false);
  };

  const formatField = (e) => {
    switch (e.target.name) {
      default:
        break;
      case "cost":
        part.cost = Number(part.cost).toFixed(2);
        if (isNaN(part.cost)) part.cost = Number(0).toFixed(2);
        break;
    }
    enableKeyboardListening(e);
    setPart(part);
  };

  const fetchPart = async (partNumber) => {
    Inventory.partAbortController.abort();
    Inventory.partAbortController = new AbortController();
    setLoadingPartMetadata(true);
    try {
      const response = await fetchApi(`api/part?partNumber=${partNumber}`, {
        signal: Inventory.partAbortController.signal
      });
      const { data } = response;
      const mappedPart = {...data, mountingTypeId: data.mountingTypeId + ""};
      setPart(mappedPart);
      setLoadingPartMetadata(false);
      return data;
    } catch (ex) {
      console.error("Exception", ex);
      setLoadingPartMetadata(false);
      if (ex.name === "AbortError") {
        return; // Continuation logic has already been skipped, so return normally
      }
      throw ex;
    }
  };

  const fetchRecentRows = async () => {
    setLoadingRecent(true);
    const response = await fetchApi(`api/part/list?orderBy=DateCreatedUtc&direction=Descending&results=${maxRecentAddedParts}`);
    const { data } = response;
    setRecentParts(data.items);
    setLoadingRecent(false);
  };

  const fetchPartTypes = async () => {
    setLoadingPartTypes(true);
    const response = await fetchApi("api/partType/all");
    const { data } = response;
    const partTypes = _.sortBy(
      data.map((item) => {
        return {
          key: item.partTypeId,
          value: item.partTypeId,
          text: item.name
        };
      }),
      "text"
    );
    setPartTypes(partTypes);
    setAllPartTypes(data);
    setLoadingPartTypes(false);
  };

  const fetchProjects = async () => {
    setLoadingProjects(true);
    const response = await fetchApi("api/project/list?orderBy=DateCreatedUtc&direction=Descending&results=99");
    const { data } = response;
    const projects = _.sortBy(
      data.map((item) => {
        return {
          key: item.projectId,
          value: item.projectId,
          text: item.name,
          label: {
            ...(_.find(ProjectColors, (c) => c.value === item.color).name !== "" && { color: _.find(ProjectColors, (c) => c.value === item.color).name }),
            circular: true,
            content: item.parts,
            size: "tiny"
          }
        };
      }),
      "text"
    );
    // ensure that the current part's projectId can't be set to an invalid project
    if (!_.find(projects, (p) => p.value === viewPreferences.lastProjectId)) {
      setPart({ ...part, projectId: "" });
    }
    setLoadingProjects(false);
    setProjects(projects);
  };

  const createPartSupplier = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setLoadingPartMetadata(true);
    const request = {
      partId: part.partId,
      name: partSupplier.name,
      supplierPartNumber: partSupplier.supplierPartNumber,
      cost: parseFloat(partSupplier.cost || '0') || 0,
      quantityAvailable: parseInt(partSupplier.quantityAvailable || '0') || 0,
      minimumOrderQuantity: parseInt(partSupplier.minimumOrderQuantity || '0') || 0,
      productUrl: partSupplier.productUrl && partSupplier.productUrl.length > 4 ? `https://${partSupplier.productUrl.replace('https://', '').replace('http://', '')}` : null,
      imageUrl: partSupplier.imageUrl && partSupplier.imageUrl.length > 4 ? `https://${partSupplier.imageUrl.replace('https://', '').replace('http://', '')}` : null
    };
    const response = await fetchApi("api/part/partSupplier", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    });
    if (response && response.responseObject.status === 200) {
      const data = response.data;
      // add part supplier to ui
      const newMetadataParts = [...metadataParts];
      newMetadataParts.push({
        additionalPartNumbers:[],
        basePartNumber: null,
        cost: data.cost,
        currency: "USD",
        datasheetUrls: [],
        description: null,
        factoryLeadTime: null,
        factoryStockAvailable: null,
        imageUrl: data.imageUrl,
        keywords: [],
        manufacturer: null,
        manufacturerPartNumber: part.manufacturerPartNumber,
        minimumOrderQuantity: data.minimumOrderQuantity,
        mountingTypeId: 0,
        packageType: null,
        partSupplierId: data.partSupplierId,
        partType: "",
        productUrl: data.productUrl,
        quantityAvailable: data.quantityAvailable,
        rank: 0,
        reference: null,
        status: null,
        supplier: data.name,
        supplierPartNumber: data.supplierPartNumber,
        swarmPartNumberManufacturerId: null
      });
      setPartSupplier(defaultPartSupplier);
      setMetadataParts(newMetadataParts);
      setShowAddPartSupplier(false);
    }
    setLoadingPartMetadata(false);
  };

  const deletePartSupplier = async (e, partSupplier) => {
    e.preventDefault();
    e.stopPropagation();
    if (!partSupplier.partSupplierId || partSupplier.partSupplierId <= 0)
      return; // ignore request to delete, not a valid partSupplier object
    setLoadingPartMetadata(true);
    const request = {
      partSupplierId: partSupplier.partSupplierId,
    };
    const response = await fetchApi("api/part/partSupplier", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    });
    if (response && response.responseObject.status === 200) {
      const isSuccess = response.data;
      // add part supplier to ui
      if (isSuccess){
        const newMetadataParts = [...metadataParts.filter(x => x.partSupplierId !== request.partSupplierId)];
        setMetadataParts(newMetadataParts);
      }else{
        toast.error(t('message.failedToDeleteSupplierPart', "Failed to delete supplier part!"));
      }
    }
    setLoadingPartMetadata(false);
  };

  const getMountingTypeById = (mountingTypeId) => {
    switch (parseInt(mountingTypeId)) {
      default:
      case 0:
        return "none";
      case 1:
        return "through hole";
      case 2:
        return "surface mount";
    }
  };

  const mergeInfoResponse = (infoResponse, storedFiles) => {
    var storedProductImages = _.filter(storedFiles, (x) => x.storedFileType === StoredFileType.ProductImage);
    var storedDatasheets = _.filter(storedFiles, (x) => x.storedFileType === StoredFileType.Datasheet);
    var storedPinouts = _.filter(storedFiles, (x) => x.storedFileType === StoredFileType.Pinout);
    var storedReferenceDesigns = _.filter(storedFiles, (x) => x.storedFileType === StoredFileType.ReferenceDesign);
    if (storedProductImages && storedProductImages.length > 0)
      infoResponse.productImages.unshift(
        ...storedProductImages.map((pi) => ({
          name: pi.originalFileName,
          value: `/api/storedFile/preview?fileName=${pi.fileName}&token=${getImagesToken()}`,
          id: pi.storedFileId
        }))
      );
    if (storedDatasheets && storedDatasheets.length > 0)
      infoResponse.datasheets.unshift(
        ...storedDatasheets.map((pi) => ({
          name: pi.originalFileName,
          value: {
            datasheetUrl: `/api/storedFile/local?fileName=${pi.fileName}&token=${getImagesToken()}`,
            description: pi.originalFileName,
            imageUrl: `/api/storedFile/preview?fileName=${pi.fileName}&token=${getImagesToken()}`,
            manufacturer: "",
            title: pi.originalFileName
          },
          id: pi.storedFileId
        }))
      );
    if (storedPinouts && storedPinouts.length > 0)
      infoResponse.pinoutImages.unshift(
        ...storedPinouts.map((pi) => ({
          name: pi.originalFileName,
          value: `/api/storedFile/preview?fileName=${pi.fileName}&token=${getImagesToken()}`,
          id: pi.storedFileId
        }))
      );
    if (storedReferenceDesigns && storedReferenceDesigns.length > 0)
      infoResponse.circuitImages.unshift(
        ...storedReferenceDesigns.map((pi) => ({
          name: pi.originalFileName,
          value: `/api/storedFile/preview?fileName=${pi.fileName}&token=${getImagesToken()}`,
          id: pi.storedFileId
        }))
      );
    return infoResponse;
  };

  /**
   * Force a save of a possible duplicate part
   * @param {any} e
   */
  const handleForceSubmit = (e) => {
    setDuplicatePartModalOpen(false);
    const updatedPart = { ...part, allowPotentialDuplicate: true };
    setPart(updatedPart);
    onSubmit(e, updatedPart);
  };

  /**
   * Save the part
   *
   * @param {any} e Event
   * @param {object} part The part to submit
   */
  const onSubmit = async (e, part) => {
    e.preventDefault();
    e.stopPropagation();
    const isExisting = part.partId > 0;

    const request = { ...part };
    request.partNumber = inputPartNumber;
    request.partTypeId = part.partTypeId.toString();
    request.mountingTypeId = part.mountingTypeId.toString();
    request.quantity = Number.parseInt(part.quantity) || 0;
    request.lowStockThreshold = Number.parseInt(part.lowStockThreshold) || 0;
    request.cost = Number.parseFloat(part.cost) || 0.0;
    request.projectId = Number.parseInt(part.projectId) || null;

    const saveMethod = isExisting ? "PUT" : "POST";
    const response = await fetchApi("api/part", {
      method: saveMethod,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request),
      // swallow any errors, we will handle them below
      catchErrors: true
    });

    let saveMessage = "";
    if (response.responseObject.status === 409) {
      // possible duplicate
      const data = await response.json();
      setDuplicateParts(data.parts);
      setDuplicatePartModalOpen(true);
    } else if (response.responseObject.status === 200) {
      // reset form if it was a new part
      if (isExisting) {
        saveMessage = t('message.savedPart', "Saved part {{partNumber}}!", { partNumber: request.partNumber });
        setSaveMessage(saveMessage);
        toast.info(saveMessage);
      } else {
        saveMessage = t('message.addedPart', "Added part {{partNumber}}!", { partNumber: request.partNumber });
        resetForm(saveMessage);
        toast.success(saveMessage);
      }
      setIsDirty(false);
      // refresh recent parts list
      await fetchRecentRows();
    } else if (response.responseObject.status === 400) {
      // other error (invalid part type, mounting type, etc.)
      saveMessage = t('message.failedSavePart', "Failed to update, check Part Type and Mounting Type");
      setSaveMessage(saveMessage);
      toast.error(saveMessage);
    }
  };

  const resetForm = (saveMessage = "", clearAll = false) => {
    setIsDirty(false);
    setIsEditing(false);
    setPartExistsInInventory(false);
    setSaveMessage(saveMessage);
    setMetadataParts([]);
    setDuplicateParts([]);
    setPartMetadataIsSubscribed(false);
    setInputPartNumber("");
    const clearedPart = {
      partId: 0,
      partNumber: "",
      allowPotentialDuplicate: false,
      quantity: (clearAll || !viewPreferences.rememberLast) ? "1" : viewPreferences.lastQuantity + "",
      lowStockThreshold: (clearAll || !viewPreferences.rememberLast) ? "10" : viewPreferences.lowStockThreshold + "",
      partTypeId: (clearAll || !viewPreferences.rememberLast) ? 0 : viewPreferences.lastPartTypeId,
      mountingTypeId: (clearAll || !viewPreferences.rememberLast) ? "0" : viewPreferences.lastMountingTypeId + "",
      packageType: "",
      keywords: "",
      description: "",
      datasheetUrl: "",
      digiKeyPartNumber: "",
      mouserPartNumber: "",
      arrowPartNumber: "",
      location: (clearAll || !viewPreferences.rememberLast) ? "" : viewPreferences.lastLocation + "",
      binNumber: (clearAll || !viewPreferences.rememberLast) ? "" : viewPreferences.lastBinNumber + "",
      binNumber2: (clearAll || !viewPreferences.rememberLast) ? "" : viewPreferences.lastBinNumber2 + "",
      cost: "",
      lowestCostSupplier: "",
      lowestCostSupplierUrl: "",
      productUrl: "",
      manufacturer: "",
      manufacturerPartNumber: "",
      imageUrl: "",
      projectId: (clearAll || !viewPreferences.rememberLast) ? "" : viewPreferences.lastProjectId,
      supplier: "",
      supplierPartNumber: ""
    };
    setPart(clearedPart);
    setLoadingPartMetadata(false);
    setLoadingPartTypes(false);
    setLoadingProjects(false);
    setInfoResponse({});
    if (clearAll && viewPreferences.rememberLast) {
      updateViewPreferences({ lastQuantity: clearedPart.quantity, lowStockThreshold: clearedPart.lowStockThreshold, lastPartTypeId: clearedPart.partTypeId, lastMountingTypeId: clearedPart.mountingTypeId, lastProjectId: clearedPart.projectId });
    }
    setInputPartNumberFocus();
  };

  const clearForm = (e) => {
    // e could be null as this special method can be called outside of the component without a synthetic event
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (props.params.partNumber) {
      navigate("/inventory/add");
      return;
    }

    resetForm("", true);
  };

  const updateNumberPicker = (e) => {
    if (viewPreferences.rememberLast) updateViewPreferences({lastQuantity: e.value});
    setPart({ ...part, quantity: e.value.toString() });
    setIsDirty(true);
  };

  const updateViewPreferences = (preference) => {
    const newViewPreferences = {...viewPreferences, ...preference};
    setViewPreferences(newViewPreferences);
    localStorage.setItem("viewPreferences", JSON.stringify(newViewPreferences));
  };

  const handleRememberLastSelection = (e, control) => {
    e.preventDefault();
    e.stopPropagation();
    updateViewPreferences({ rememberLast: control.checked });
  };

  const handleInputPartNumberKeyDown = (e) => {
    // this logic is used to prevent barcode scanners from submitting the form with the enter key, when input has focus
    // here we are using window instead of a state object for performance reasons :-0
    if (window) {
      const elapsed = new Date().getTime() - window.lastKeyDown;
      if (e.keyCode === 13 && elapsed < 200) {
        e.preventDefault();
      }
      window.lastKeyDown = new Date().getTime();
    }
  }

  const handlePartSupplierChange = (e, control) => {
    e.preventDefault();
    e.stopPropagation();
    partSupplier[control.name] = control.value;
    setPartSupplier({ ...partSupplier });
  };

  const handleInputPartNumberChange = (e, control) => {
    e.preventDefault();
    e.stopPropagation();
    setPartMetadataIsSubscribed(false);
    setPartMetadataError(null);
    let searchPartNumber = control.value;

    // check if the input looks like a barcode scanner tag, in case it's used when a text input has focus
    if (searchPartNumber && typeof control.value === "string" && control.value.includes("[)>")) {
      console.log('barcode input detected, switching mode');
      enableKeyboardListening();
      setKeyboardPassThrough("[)>");
      control.value = "";
      return;
    }

    if (searchPartNumber && searchPartNumber.length > 0) {
      searchPartNumber = control.value.replace("\t", "");
      searchDebounced(searchPartNumber, part, partTypes);
    }

    setInputPartNumber(searchPartNumber);
    setIsDirty(true);
  };

  const handlePartTypeChange = (e, partType) => { 
    if (viewPreferences.rememberLast && !isEditing) updateViewPreferences({lastPartTypeId: partType.partTypeId});
    setPart({...part, partTypeId: partType.partTypeId});
    setIsDirty(true); 
  }

  const handleChange = (e, control) => {
    e.preventDefault();
    e.stopPropagation();
    setPartMetadataIsSubscribed(false);
    setPartMetadataError(null);
    const updatedPart = { ...part };

    // check if the input looks like a barcode scanner tag, in case it's used when a text input has focus
    if (control && control.value && typeof control.value === "string" && control.value.includes("[)>")) {
      // console.log('barcode input detected, switching mode');
      enableKeyboardListening();
      setKeyboardPassThrough("[)>");
      updatedPart[control.name] = "";
      return;
    }

    updatedPart[control.name] = control.value;
    switch (control.name) {
      case "partNumber":
        if (updatedPart.partNumber && updatedPart.partNumber.length > 0) {
          updatedPart[control.name] = control.value.replace("\t", "");
          searchDebounced(updatedPart.partNumber, updatedPart, partTypes);
        }
        break;
      case "partTypeId":
        if (viewPreferences.rememberLast && !isEditing) updateViewPreferences({lastPartTypeId: control.value});
        if (updatedPart.partNumber && updatedPart.partNumber.length > 0) searchDebounced(updatedPart.partNumber, updatedPart, partTypes);
        break;
      case "mountingTypeId":
        if (viewPreferences.rememberLast && !isEditing) updateViewPreferences({lastMountingTypeId: control.value});
        if (updatedPart.partNumber && updatedPart.partNumber.length > 0) searchDebounced(updatedPart.partNumber, updatedPart, partTypes);
        break;
      case "lowStockThreshold":
        if (viewPreferences.rememberLast && !isEditing) updateViewPreferences({lowStockThreshold: control.value});
        break;
      case "projectId":
        if (viewPreferences.rememberLast && !isEditing) updateViewPreferences({lastProjectId: control.value});
        break;
      case "location":
        updatedPart[control.name] = control.value.replace("\t", "");
        if (viewPreferences.rememberLast && !isEditing) updateViewPreferences({lastLocation: updatedPart[control.name]});
        break;
      case "binNumber":
        updatedPart[control.name] = control.value.replace("\t", "");
        if (viewPreferences.rememberLast && !isEditing) updateViewPreferences({lastBinNumber: updatedPart[control.name]});
        break;
      case "binNumber2":
        updatedPart[control.name] = control.value.replace("\t", "");
        if (viewPreferences.rememberLast && !isEditing) updateViewPreferences({lastBinNumber2: updatedPart[control.name]});
        break;
      default:
        break;
    }
    setPart({ ...updatedPart });
    setIsDirty(true);
  };

  const printLabel = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await fetchApi(`api/part/print?partNumber=${part.partNumber}&generateImageOnly=false`, { method: "POST" });
  };

  const setPartFromMetadata = (metadataParts, suggestedPart) => {
    if (partTypesRef.current.length === 0)
      console.error("There are no partTypes! This shouldn't happen and is a bug.");

    const entity = { ...part };
    const mappedPart = {
      partNumber: suggestedPart.basePartNumber,
      partTypeId: getPartTypeId(suggestedPart.partType, partTypesRef.current),
      mountingTypeId: suggestedPart.mountingTypeId + "",
      packageType: suggestedPart.packageType,
      keywords: suggestedPart.keywords && suggestedPart.keywords.join(" ").toLowerCase(),
      description: suggestedPart.description,
      datasheetUrls: suggestedPart.datasheetUrls,
      supplier: suggestedPart.supplier,
      supplierPartNumber: suggestedPart.supplierPartNumber,
      cost: suggestedPart.cost,
      productUrl: suggestedPart.productUrl,
      manufacturer: suggestedPart.manufacturer,
      manufacturerPartNumber: suggestedPart.manufacturerPartNumber,
      imageUrl: suggestedPart.imageUrl,
      status: suggestedPart.status,
      quantity: suggestedPart.barcodeQuantity || 1,
    };
    // console.log('suggestedPart', mappedPart);
    entity.partNumber = mappedPart.partNumber;
    entity.supplier = mappedPart.supplier;
    entity.supplierPartNumber = mappedPart.supplierPartNumber;
    if (mappedPart.partTypeId) entity.partTypeId = mappedPart.partTypeId || "";
    if (mappedPart.mountingTypeId) entity.mountingTypeId = (mappedPart.mountingTypeId || "") + "";
    entity.packageType = mappedPart.packageType || "";
    entity.cost = mappedPart.cost || 0.0;
    entity.keywords = mappedPart.keywords || "";
    entity.description = mappedPart.description || "";
    entity.manufacturer = mappedPart.manufacturer || "";
    entity.manufacturerPartNumber = mappedPart.manufacturerPartNumber || "";
    entity.productUrl = mappedPart.productUrl || "";
    entity.imageUrl = mappedPart.imageUrl || "";
    if (mappedPart.datasheetUrls.length > 0) {
      entity.datasheetUrl = _.first(mappedPart.datasheetUrls) || "";
    }
    if (mappedPart.supplier === "DigiKey") {
      entity.digiKeyPartNumber = mappedPart.supplierPartNumber || "";
      // also map mouser
      let searchResult = _.find(metadataParts, (e) => {
        return e !== undefined && e.supplier === "Mouser" && e.manufacturerPartNumber === mappedPart.manufacturerPartNumber;
      });
      if (searchResult) {
        entity.mouserPartNumber = searchResult.supplierPartNumber;
        if (entity.packageType.length === 0) entity.packageType = searchResult.packageType;
        if (entity.datasheetUrl.length === 0) entity.datasheetUrl = _.first(searchResult.datasheetUrls) || "";
        if (entity.imageUrl.length === 0) entity.imageUrl = searchResult.imageUrl;
      }
      // also map arrow
      searchResult = _.find(metadataParts, (e) => {
        return e !== undefined && e.supplier === "Arrow" && e.manufacturerPartNumber === mappedPart.manufacturerPartNumber;
      });
      if (searchResult) {
        entity.arrowPartNumber = searchResult.supplierPartNumber;
        if (entity.packageType.length === 0) entity.packageType = searchResult.packageType;
        if (entity.datasheetUrl.length === 0) entity.datasheetUrl = _.first(searchResult.datasheetUrls) || "";
        if (entity.imageUrl.length === 0) entity.imageUrl = searchResult.imageUrl;
      }
      
    }
    if (mappedPart.supplier === "Mouser") {
      entity.mouserPartNumber = mappedPart.supplierPartNumber || "";
      // also map digikey
      let searchResult = _.find(metadataParts, (e) => {
        return e !== undefined && e.supplier === "DigiKey" && e.manufacturerPartNumber === mappedPart.manufacturerPartNumber;
      });
      if (searchResult) {
        entity.digiKeyPartNumber = searchResult.supplierPartNumber;
        if (entity.packageType.length === 0) entity.packageType = searchResult.packageType;
        if (entity.datasheetUrl.length === 0) entity.datasheetUrl = _.first(searchResult.datasheetUrls) || "";
        if (entity.imageUrl.length === 0) entity.imageUrl = searchResult.imageUrl;
      }
      // also map arrow
      searchResult = _.find(metadataParts, (e) => {
        return e !== undefined && e.supplier === "Arrow" && e.manufacturerPartNumber === mappedPart.manufacturerPartNumber;
      });
      if (searchResult) {
        entity.arrowPartNumber = searchResult.supplierPartNumber;
        if (entity.packageType.length === 0) entity.packageType = searchResult.packageType;
        if (entity.datasheetUrl.length === 0) entity.datasheetUrl = _.first(searchResult.datasheetUrls) || "";
        if (entity.imageUrl.length === 0) entity.imageUrl = searchResult.imageUrl;
      }
    }
    if (mappedPart.supplier === "Arrow") {
      entity.arrowPartNumber = mappedPart.supplierPartNumber || "";
      // also map digikey
      let searchResult = _.find(metadataParts, (e) => {
        return e !== undefined && e.supplier === "DigiKey" && e.manufacturerPartNumber === mappedPart.manufacturerPartNumber;
      });
      if (searchResult) {
        entity.digiKeyPartNumber = searchResult.supplierPartNumber;
        if (entity.packageType.length === 0) entity.packageType = searchResult.packageType;
        if (entity.datasheetUrl.length === 0) entity.datasheetUrl = _.first(searchResult.datasheetUrls) || "";
        if (entity.imageUrl.length === 0) entity.imageUrl = searchResult.imageUrl;
      }
      // also map mouser
      searchResult = _.find(metadataParts, (e) => {
        return e !== undefined && e.supplier === "Mouser" && e.manufacturerPartNumber === mappedPart.manufacturerPartNumber;
      });
      if (searchResult) {
        entity.mouserPartNumber = searchResult.supplierPartNumber;
        if (entity.packageType.length === 0) entity.packageType = searchResult.packageType;
        if (entity.datasheetUrl.length === 0) entity.datasheetUrl = _.first(searchResult.datasheetUrls) || "";
        if (entity.imageUrl.length === 0) entity.imageUrl = searchResult.imageUrl;
      }
    }

    const lowestCostPart = _.first(
      _.sortBy(
        _.filter(metadataParts, (i) => i.cost > 0),
        "cost"
      )
    );

    if (lowestCostPart) {
      entity.lowestCostSupplier = lowestCostPart.supplier;
      entity.lowestCostSupplierUrl = lowestCostPart.productUrl;
    }
    setPart(entity);
  };

  const handleChooseAlternatePart = (e, part, partTypes) => {
    setPartFromMetadata(metadataParts, part);
    setPartModalOpen(false);
  };

  const handleOpenModal = (e) => {
    e.preventDefault();
    setPartModalOpen(true);
  };

  const handleBulkBarcodeScan = (e) => {
    e.preventDefault();
    setBulkScanIsOpen(true);
  };

  const handleBulkScanClose = () => {
    setBulkScanIsOpen(false);
  };

  const renderAllMatchingParts = (part, metadataParts) => {
    return (
      <Table compact celled selectable size="small" className="partstable">
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>{t('label.part', "Part")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.manufacturer', "Manufacturer")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.partType', "Part Type")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.supplier', "Supplier")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.supplierType', "Supplier Type")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.packageType', "Package Type")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.mountingType', "Mounting Type")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.cost', "Cost")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.image', "Image")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.datasheet', "Datasheet")}</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {metadataParts.map((p, index) => (
            <Popup
              key={index}
              content="This is a test"
              trigger={
                <Table.Row onClick={(e) => handleChooseAlternatePart(e, p, partTypes)}>
                  <Table.Cell>
                    {part.supplier === p.supplier && part.supplierPartNumber === p.supplierPartNumber ? (
                      <Label ribbon>{p.manufacturerPartNumber}</Label>
                    ) : (
                      p.manufacturerPartNumber
                    )}
                  </Table.Cell>
                  <Table.Cell>{p.manufacturer}</Table.Cell>
                  <Table.Cell>{p.partType}</Table.Cell>
                  <Table.Cell>{p.supplier}</Table.Cell>
                  <Table.Cell>{p.supplierPartNumber}</Table.Cell>
                  <Table.Cell>{p.packageType}</Table.Cell>
                  <Table.Cell>{getMountingTypeById(p.mountingTypeId)}</Table.Cell>
                  <Table.Cell>{p.cost}</Table.Cell>
                  <Table.Cell>
                    <Image src={p.imageUrl} size="mini"></Image>
                  </Table.Cell>
                  <Table.Cell>
                    {p.datasheetUrls.map(
                      (d, dindex) =>
                        d &&
                        d.length > 0 && (
                          <Button key={dindex} onClick={(e) => handleHighlightAndVisit(e, d)}>
                            {t('button.viewDatasheet', "View Datasheet")}
                          </Button>
                        )
                    )}
                  </Table.Cell>
                </Table.Row>
              }
            />
          ))}
        </Table.Body>
      </Table>
    );
  };

  const renderDuplicateParts = () => {
    return (
      <Table compact celled selectable size="small" className="partstable">
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>{t('label.partNumber', "Part Number")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.manufacturerPart', "Manufacturer Part")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.manufacturer', "Manufacturer")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.description', "Description")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.partType', "Part Type")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.location', "Location")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.binNumber', "Bin Number")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.binNumber2', "Bin Number 2")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.mountingType', "Mounting Type")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.image', "Image")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.datasheet', "Datasheet")}</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {duplicateParts.map((p, index) => (
            <Table.Row key={index}>
              <Table.Cell>{p.partNumber}</Table.Cell>
              <Table.Cell>{p.manufacturerPartNumber}</Table.Cell>
              <Table.Cell>{p.manufacturer}</Table.Cell>
              <Table.Cell>{p.description}</Table.Cell>
              <Table.Cell>{p.partType}</Table.Cell>
              <Table.Cell>{p.location}</Table.Cell>
              <Table.Cell>{p.binNumber}</Table.Cell>
              <Table.Cell>{p.binNumber2}</Table.Cell>
              <Table.Cell>{getMountingTypeById(p.mountingTypeId)}</Table.Cell>
              <Table.Cell>
                <Image src={p.imageUrl} size="mini"></Image>
              </Table.Cell>
              <Table.Cell>
                <Button onClick={(e) => handleHighlightAndVisit(e, p.datasheetUrl)}>{t('button.viewDatasheet', "View Datasheet")}</Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    );
  };

  const handlePartModalClose = () => {
    setPartModalOpen(false);
  };

  const handleDuplicatePartModalClose = () => {
    setDuplicatePartModalOpen(false);
  };

  const disableHelp = () => {
    // const { viewPreferences } = state;
    // const val = { ...viewPreferences, helpDisabled: true };
    // localStorage.setItem('viewPreferences', JSON.stringify(val));
  };

  const handleHighlightAndVisit = (e, url) => {
    handleVisitLink(e, url);
    // this handles highlighting of parent row
    const parentTable = ReactDOM.findDOMNode(e.target).parentNode.parentNode.parentNode;
    const targetNode = ReactDOM.findDOMNode(e.target).parentNode.parentNode;
    for (let i = 0; i < parentTable.rows.length; i++) {
      const row = parentTable.rows[i];
      if (row.classList.contains("positive")) row.classList.remove("positive");
    }
    targetNode.classList.toggle("positive");
  };

  const handleVisitLink = (e, url) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(url, "_blank");
  };

  const handleRecentPartClick = async (e, part) => {
    setPart(part);
    props.history(`/inventory/${encodeURIComponent(part.partNumber)}`);
    await fetchPart(part.partNumber);
  };

  const onSubmitScannedParts = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setBulkScanSaving(true);
    const request = {
      parts: scannedParts
    };
    const response = await fetchApi("api/part/bulk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    });
    if (response.responseObject.status === 200) {
      const { data } = response;
      toast.success(t('message.addXParts', "Added {{count}} new parts!", {count: data.length}));
    }
    localStorage.setItem("scannedPartsSerialized", JSON.stringify([]));
    setBulkScanIsOpen(false);
    setScannedParts([]);
    setBulkScanSaving(false);
  };

  const handleScannedPartChange = (e, control, scannedPart) => {
    e.preventDefault();
    e.stopPropagation();
    scannedPart[control.name] = control.value;
    setScannedParts([...scannedParts]);
    setIsDirty(true);
  };

  const deleteScannedPart = (e, scannedPart) => {
    e.preventDefault();
    e.stopPropagation();
    const scannedPartsDeleted = _.without(scannedParts, _.findWhere(scannedParts, { partNumber: scannedPart.partNumber }));
    localStorage.setItem("scannedPartsSerialized", JSON.stringify(scannedPartsDeleted));
    setScannedParts(scannedPartsDeleted);
  };

  const handleDeletePart = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await fetchApi(`api/part`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ partId: selectedPart.partId })
    });
    const partsDeleted = _.without(parts, _.findWhere(parts, { partId: selectedPart.partId }));
    setConfirmDeleteIsOpen(false);
    setParts(partsDeleted);
    setSelectedPart(null);
    props.history(`/inventory`);
  };

  const handleDeleteLocalFile = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await fetchApi(`api/storedfile`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ storedFileId: selectedLocalFile.localFile.id })
    });
    var itemsExceptDeleted;
    switch (selectedLocalFile.type) {
      case "productImages":
        itemsExceptDeleted = _.without(infoResponse.productImages, _.findWhere(infoResponse.productImages, { id: selectedLocalFile.localFile.id }));
        setInfoResponse({ ...infoResponse, productImages: itemsExceptDeleted });
        break;
      case "datasheets":
        itemsExceptDeleted = _.without(infoResponse.datasheets, _.findWhere(infoResponse.datasheets, { id: selectedLocalFile.localFile.id }));
        setInfoResponse({ ...infoResponse, datasheets: itemsExceptDeleted });
        if (itemsExceptDeleted.length > 0) setDatasheetMeta(itemsExceptDeleted[0]);
        break;
      case "pinoutImages":
        itemsExceptDeleted = _.without(infoResponse.pinoutImages, _.findWhere(infoResponse.pinoutImages, { id: selectedLocalFile.localFile.id }));
        setInfoResponse({ ...infoResponse, pinoutImages: itemsExceptDeleted });
        break;
      case "circuitImages":
        itemsExceptDeleted = _.without(infoResponse.circuitImages, _.findWhere(infoResponse.circuitImages, { id: selectedLocalFile.localFile.id }));
        setInfoResponse({ ...infoResponse, circuitImages: itemsExceptDeleted });
        break;
      default:
    }

    setConfirmDeleteLocalFileIsOpen(false);
    setSelectedLocalFile(null);
  };

  const confirmDeleteOpen = (e, part) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDeleteIsOpen(true);
    setSelectedPart(part);
    setConfirmPartDeleteContent(
      <p>
        <Trans i18nKey="confirm.deletePart" name={inputPartNumber}>
        Are you sure you want to delete part <b>{{name: inputPartNumber}}</b>?
        </Trans>
        <br />
        <br />
        <Trans i18nKey="confirm.permanent">
        This action is <i>permanent and cannot be recovered</i>.
        </Trans>        
      </p>
    );
  };

  const confirmDeleteClose = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDeleteIsOpen(false);
    setSelectedPart(null);
  };

  const confirmDeleteLocalFileOpen = (e, localFile, type) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDeleteLocalFileIsOpen(true);
    setSelectedLocalFile({ localFile, type });
    setConfirmLocalFileDeleteContent(
      <p>
        <Trans i18nKey="confirm.deleteLocalFile" name={localFile.name}>
        Are you sure you want to delete this local file named <b>{{name: localFile.name}}</b>?
        </Trans>
        <br />
        <br />
        <Trans i18nKey="confirm.permanent">
        This action is <i>permanent and cannot be recovered</i>.
        </Trans>
      </p>
    );
  };

  const confirmDeleteLocalFileClose = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDeleteLocalFileIsOpen(false);
    setSelectedLocalFile(null);
  };

  const onScannedInputKeyDown = (e, scannedPart) => {
    if (e.keyCode === 13) {
      // copy downward
      let beginCopy = false;
      scannedParts.forEach((part) => {
        if (part.partName === scannedPart.partName) beginCopy = true;
        if (beginCopy && part[e.target.name] === "") {
          part[e.target.name] = scannedPart[e.target.name];
        }
      });
      setScannedParts(scannedParts);
    }
  };

  const visitAnchor = (e, anchor) => {
    e.preventDefault();
    var redirectToURL = document.URL.replace(/#.*$/, "");

    redirectToURL = redirectToURL + anchor;
    window.location.href = redirectToURL;
  };

  const setDatasheetMeta = (datasheet) => {
    const partName = datasheet.name;
    const title = datasheet.value.title;
    const description = datasheet.value.description;
    const manufacturer = datasheet.value.manufacturer;
    setDatasheetTitle(title);
    setDatasheetPartName(partName);
    setDatasheetManufacturer(manufacturer);
    setDatasheetDescription(description);
  };

  const onCurrentDatasheetChanged = (activeIndex, control) => {
    setDatasheetMeta(infoResponse.datasheets[activeIndex]);
  };

  const handleAddBulkScanRow = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setScannedParts([...scannedParts, {
      basePartNumber: '',
      partNumber: '',
      quantity: 1,
      description: '',
      origin: '',
      location: '',
      binNumber: '',
      binNumber2: ''
     }]);
  };

  const handleShowAddPartSupplier = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowAddPartSupplier(!showAddPartSupplier);
  };

  const getDatasheetAttributes = (datasheet) => {
    return {
      'data-id': datasheet.id || '0',
      'data-resourceid': datasheet.value.resourceId,
    };
  };

  const handleSetSuggestedPartNumber = (e, value) => {
    e.preventDefault();
    e.stopPropagation();
    setInputPartNumber(value);
  };

  const renderScannedParts = (scannedParts, highlightScannedPart) => {
    if (highlightScannedPart) {
      // reset the css highlight animation
      setTimeout(() => {
        const elements = document.getElementsByClassName("scannedPartAnimation");
        for (let i = 0; i < elements.length; i++) {
          elements[i].classList.add("lastScannedPart");
          if (elements[i].classList.contains("scannedPartAnimation")) elements[i].classList.remove("scannedPartAnimation");
        }
      }, 750);
    }
    return (
      <Form className="notdroptarget">
        <Table compact celled striped size="small">
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t('label.part', "Part")}</Table.HeaderCell>
              <Table.HeaderCell>{t('label.quantity', "Quantity")}</Table.HeaderCell>
              <Table.HeaderCell>{t('label.description', "Description")}</Table.HeaderCell>
              <Table.HeaderCell>{t('label.origin', "Origin")}</Table.HeaderCell>
              <Table.HeaderCell>{t('label.location', "Location")}</Table.HeaderCell>
              <Table.HeaderCell>{t('label.binNumber', "Bin Number")}</Table.HeaderCell>
              <Table.HeaderCell>{t('label.binNumber2', "Bin Number 2")}</Table.HeaderCell>
              <Table.HeaderCell width={1}></Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {scannedParts.map((p, index) => (
              <Table.Row
                key={index}
                className={highlightScannedPart && p.partNumber === highlightScannedPart.partNumber ? `scannedPartAnimation ${Math.random()}` : ""}
              >
                <Table.Cell collapsing style={{maxWidth: '200px'}}>
                  <Form.Input 
                    name="partNumber" 
                    value={p.partNumber || ''} 
                    onChange={(e, c) => handleScannedPartChange(e, c, p)} 
                    onFocus={disableKeyboardListening} 
                    onBlur={e => { enableKeyboardListening(); fetchBarcodeMetadata(e, p.partNumber); }} 
                  />
                </Table.Cell>
                <Table.Cell collapsing>
                  <Form.Input
                    width={10}
                    value={p.quantity || '1'}
                    onChange={(e, c) => handleScannedPartChange(e, c, p)}
                    name="quantity"
                    onFocus={disableKeyboardListening}
                    onBlur={enableKeyboardListening}
                  />
                </Table.Cell>
                <Table.Cell collapsing className="ellipsis" style={{maxWidth: '200px'}}>
                  <Popup 
                    wide
                    hoverable
                    content={<p>{p.description}</p>}
                    trigger={<Form.Input name="description" value={p.description || ''} onChange={(e, c) => handleScannedPartChange(e, c, p)} onFocus={disableKeyboardListening} onBlur={enableKeyboardListening} />}
                  />                  
                </Table.Cell>
                <Table.Cell collapsing textAlign="center" verticalAlign="middle" width={1}>
                  <Flag name={p.origin || ""} />
                </Table.Cell>
                <Table.Cell collapsing>
                  <Form.Input
                    width={16}
                    placeholder={t('page.inventory.placeholder.location', "Home lab")}
                    value={p.location || ''}
                    onChange={(e, c) => handleScannedPartChange(e, c, p)}
                    name="location"
                    onFocus={disableKeyboardListening}
                    onBlur={enableKeyboardListening}
                  />
                </Table.Cell>
                <Table.Cell collapsing>
                  <Form.Input
                    width={14}
                    placeholder=""
                    value={p.binNumber || ''}
                    onChange={(e, c) => handleScannedPartChange(e, c, p)}
                    name="binNumber"
                    onFocus={disableKeyboardListening}
                    onBlur={enableKeyboardListening}
                  />
                </Table.Cell>
                <Table.Cell collapsing>
                  <Form.Input
                    width={14}
                    placeholder=""
                    value={p.binNumber2 || ''}
                    onChange={(e, c) => handleScannedPartChange(e, c, p)}
                    name="binNumber2"
                    onFocus={disableKeyboardListening}
                    onBlur={enableKeyboardListening}
                  />
                </Table.Cell>
                <Table.Cell collapsing textAlign="center" verticalAlign="middle">
                  <Button type="button" circular size="mini" icon="delete" title="Delete" onClick={(e) => deleteScannedPart(e, p)} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Form>
    );
  };

  const renderRecentParts = (recentParts) => {
    return (
      <Table compact celled selectable striped>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>{t('label.part', "Part")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.quantity', "Quantity")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.partType', "Part Type")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.manufacturerPart', "Manufacturer Part")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.location', "Location")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.binNumber', "Bin Number")}</Table.HeaderCell>
            <Table.HeaderCell>{t('label.binNumber2', "Bin Number 2")}</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {recentParts.map((p, index) => (
            <Table.Row key={index} onClick={(e) => handleRecentPartClick(e, p)}>
              <Table.Cell>{index === 0 ? <Label ribbon>{p.partNumber}</Label> : p.partNumber}</Table.Cell>
              <Table.Cell>{p.quantity}</Table.Cell>
              <Table.Cell>{p.partType}</Table.Cell>
              <Table.Cell>{p.manufacturerPartNumber}</Table.Cell>
              <Table.Cell>{p.location}</Table.Cell>
              <Table.Cell>{p.binNumber}</Table.Cell>
              <Table.Cell>{p.binNumber2}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    );
  };

  const matchingPartsList = renderAllMatchingParts(part, metadataParts);
  const title = isEditing 
    ? t('page.inventory.edittitle', "Edit Inventory") 
    : t('page.inventory.addtitle', "Add Inventory");

  /* RENDER */

  return (
    <div>
      <Modal centered open={duplicatePartModalOpen} onClose={handleDuplicatePartModalClose}>
        <Modal.Header>Duplicate Part</Modal.Header>
        <Modal.Content scrolling>
          <Modal.Description>
            <h3>There is a possible duplicate part already in your inventory.</h3>
            {renderDuplicateParts()}
          </Modal.Description>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={handleDuplicatePartModalClose}>{t('button.cancel', "Cancel")}</Button>
          <Button primary onClick={handleForceSubmit}>
          {t('button.saveAnyway', "Save Anyway")}
          </Button>
        </Modal.Actions>
      </Modal>
      <Confirm
        className="confirm"
        header={t('confirm.header.deletePart', "Delete Part")}
        open={confirmDeleteIsOpen}
        onCancel={confirmDeleteClose}
        onConfirm={handleDeletePart}
        content={confirmPartDeleteContent}
      />
      <Confirm
        className="confirm"
        header={t('confirm.header.deleteFile', "Delete File")}
        open={confirmDeleteLocalFileIsOpen}
        onCancel={confirmDeleteLocalFileClose}
        onConfirm={handleDeleteLocalFile}
        content={confirmLocalFileDeleteContent}
      />

      {/* FORM START */}

      <Form onSubmit={e => onSubmit(e, part)} className="inventory">
        {!isEditing && <BarcodeScannerInput onReceived={handleBarcodeInput} listening={isKeyboardListening} passThrough={keyboardPassThrough} minInputLength={3} /> }
        {part && part.partId > 0 && (
          <Button
            type="button"
            animated="vertical"
            circular
            floated="right"
            size="mini"
            onClick={printLabel}
            style={{ marginTop: "5px", marginRight: "20px", width: "100px" }}
          >
            <Button.Content hidden>{t('button.print', "Print")}</Button.Content>
            <Button.Content visible>
              <Icon name="print" />
            </Button.Content>
          </Button>
        )}
        {part.partNumber && <Image src={`api/part/preview?partNumber=${part.partNumber}&token=${getImagesToken()}`} width={180} floated="right" style={{ marginTop: "0px" }} />}
        <FormHeader name={title} to="..">
        </FormHeader>
        {!isEditing &&
          <Popup
            wide
            content={<p>{t('page.inventory.popup.bulkAddParts', "Bulk add parts using a barcode scanner")}</p>}
            trigger={
              <div style={{ width: "132px", height: "30px", display: "inline-block", cursor: "pointer" }} className="barcodescan" onClick={handleBulkBarcodeScan}>
                <div className="anim-box">
                  <div className="scanner" />
                  <div className="anim-item anim-item-sm"></div>
                  <div className="anim-item anim-item-lg"></div>
                  <div className="anim-item anim-item-lg"></div>
                  <div className="anim-item anim-item-sm"></div>
                  <div className="anim-item anim-item-lg"></div>
                  <div className="anim-item anim-item-sm"></div>
                  <div className="anim-item anim-item-md"></div>
                  <div className="anim-item anim-item-sm"></div>
                  <div className="anim-item anim-item-md"></div>
                  <div className="anim-item anim-item-lg"></div>
                  <div className="anim-item anim-item-sm"></div>
                  <div className="anim-item anim-item-sm"></div>
                  <div className="anim-item anim-item-lg"></div>
                  <div className="anim-item anim-item-sm"></div>
                  <div className="anim-item anim-item-lg"></div>
                  <div className="anim-item anim-item-sm"></div>
                  <div className="anim-item anim-item-lg"></div>
                  <div className="anim-item anim-item-sm"></div>
                  <div className="anim-item anim-item-md"></div>
                </div>
              </div>
            }
          />
        }

        <div className="page-banner">
          {partMetadataIsSubscribed && (
            <div className="page-notice" onClick={() => setPartMetadataIsSubscribed(false)}>
              <div>
                <Icon name="close" /> 
                <Trans i18nKey="message.noPartInfo" partNumber={inputPartNumber}>
                No part information is available for '{{partNumber: inputPartNumber}}'. You are subscribed to updates and will be automatically updated when the part is indexed.
                </Trans>
              </div>
            </div>
          )}
          {partMetadataError && (
            <div className="page-error" onClick={() => setPartMetadataError(null)}>
              <Icon name="close" /> {partMetadataError}
            </div>
          )}
        </div>

        <Grid celled className="inventory-container">
          <Grid.Row>
            <Grid.Column width={12} className="left-column">
              {/** LEFT COLUMN */}
              <Form.Group>
                <Form.Field>
                  <Form.Input
                    label={t('label.part', "Part")}
                    required
                    placeholder="LM358"
                    focus
                    /* this should be the only field that is not updated on an info update */
                    value={inputPartNumber || ""}
                    onChange={handleInputPartNumberChange}
                    name="inputPartNumber"
                    onFocus={disableKeyboardListening}
                    onBlur={enableKeyboardListening}
                    onKeyDown={handleInputPartNumberKeyDown}
                    icon
                  >
                    <input ref={partInputPartNumberRef} />
                    <Icon name="search" />
                  </Form.Input>
                  {!isEditing && part.partNumber && part.partNumber !== inputPartNumber && <div className="suggested-part">{<span>{t('page.inventory.suggestedPart')}: <a href="#" onClick={e => handleSetSuggestedPartNumber(e, part.partNumber)}>{part.partNumber}</a></span>}</div>}
                  {!isEditing && partExistsInInventory && <div className="suggested-part">This <Link to={`/inventory/${inputPartNumber}`}>part</Link> <span>already exists</span> in your inventory.</div>}
                </Form.Field>
                <Form.Field width={6}>
                  <PartTypeSelector 
                    label={t('label.partType', "Part Type")}
                    name="partTypeId"
                    value={part.partTypeId || ""}
                    partTypes={allPartTypes} 
                    onSelect={handlePartTypeChange}
                    onFocus={disableKeyboardListening}
                    onBlur={enableKeyboardListening}
                  />
                </Form.Field>
                {/*<Form.Dropdown
                  label={t('label.partType', "Part Type")}
                  placeholder={t('label.partType', "Part Type")}
                  loading={loadingPartTypes}
                  search
                  selection
                  value={part.partTypeId || ""}
                  options={partTypes}
                  onChange={handleChange}
                  name="partTypeId"
                  onFocus={disableKeyboardListening}
                  onBlur={enableKeyboardListening}
                />*/}
                <Form.Dropdown
                  label={t('label.mountingType', "Mounting Type")}
                  placeholder={t('label.mountingType', "Mounting Type")}
                  search
                  selection
                  value={(part.mountingTypeId || "") + ""}
                  options={mountingTypes}
                  onChange={handleChange}
                  name="mountingTypeId"
                  onFocus={disableKeyboardListening}
                  onBlur={enableKeyboardListening}
                />
              </Form.Group>
              <Form.Group>
                <Popup
                  hideOnScroll
                  disabled={viewPreferences.helpDisabled}
                  onOpen={disableHelp}
                  content={t('page.inventory.popup.quantity', "Use the mousewheel and CTRL/ALT to change step size")}
                  trigger={
                    <Form.Field
                      control={NumberPicker}
                      label={t('label.quantity', "Quantity")}
                      placeholder="10"
                      min={0}
                      value={part.quantity || ""}
                      onChange={updateNumberPicker}
                      name="quantity"
                      autoComplete="off"
                      onFocus={disableKeyboardListening}
                      onBlur={enableKeyboardListening}
                    />
                  }
                />
                <Popup
                  hideOnScroll
                  disabled={viewPreferences.helpDisabled}
                  onOpen={disableHelp}
                  content={t('page.inventory.popup.lowStock', "Alert when the quantity gets below this value")}
                  trigger={
                    <Form.Input
                      label={t('label.lowStock', "Low Stock")}
                      placeholder="10"
                      value={part.lowStockThreshold || ""}
                      onChange={handleChange}
                      name="lowStockThreshold"
                      width={3}
                      onFocus={disableKeyboardListening}
                      onBlur={enableKeyboardListening}
                    />
                  }
                />
              </Form.Group>

              <Segment secondary>
                <Form.Group>
                  <Popup
                    hideOnScroll
                    disabled={viewPreferences.helpDisabled}
                    onOpen={disableHelp}
                    content={t('page.inventory.popup.location', "A custom value for identifying the parts location")}
                    trigger={
                      <Form.Input
                        label={t('label.location', "Location")}
                        placeholder="Home lab"
                        value={part.location || ""}
                        onChange={handleChange}
                        name="location"
                        onFocus={disableKeyboardListening}
                        onBlur={enableKeyboardListening}
                        width={5}
                      />
                    }
                  />
                  <Popup
                    hideOnScroll
                    disabled={viewPreferences.helpDisabled}
                    onOpen={disableHelp}
                    content={t('page.inventory.popup.binNumber', "A custom value for identifying the parts location")}
                    trigger={
                      <Form.Input
                        label={t('label.binNumber', "Bin Number")}
                        placeholder={t('page.inventory.placeholder.binNumber', "IC Components 2")}
                        value={part.binNumber || ""}
                        onChange={handleChange}
                        name="binNumber"
                        onFocus={disableKeyboardListening}
                        onBlur={enableKeyboardListening}
                        width={4}
                      />
                    }
                  />
                  <Popup
                    hideOnScroll
                    disabled={viewPreferences.helpDisabled}
                    onOpen={disableHelp}
                    content={t('page.inventory.popup.binNumber', "A custom value for identifying the parts location")}
                    trigger={
                      <Form.Input
                        label={t('label.binNumber2', "Bin Number 2")}
                        placeholder={t('page.inventory.placeholder.binNumber2', "14")}
                        value={part.binNumber2 || ""}
                        onChange={handleChange}
                        name="binNumber2"
                        onFocus={disableKeyboardListening}
                        onBlur={enableKeyboardListening}
                        width={4}
                      />
                    }
                  />
                </Form.Group>
              </Segment>
              <Form.Field inline>
                {!isEditing &&
                  <Popup
                    wide="very"
                    position="top right"
                    content={
                    <p>
                      <Trans i18nKey="page.inventory.popup.rememberLastSelection">
                      Enable this toggle to remember the last selected values of: <i>Part Type, Mounting Type, Quantity, Low Stock, Project, Location, Bin Number, Bin Number 2</i>
                      </Trans>
                    </p>}
                    trigger={<Checkbox toggle label={t('label.rememberLastSelection', "Remember last selection")} className="left small" style={{float: 'right'}} checked={viewPreferences.rememberLast || false} onChange={handleRememberLastSelection} />}
                  />
                }
                <Button.Group>
                  <Button type="submit" primary style={{ width: "200px" }} disabled={!isDirty}>
                    <Icon name="save" />
                    {t('button.save', "Save")}
                  </Button>
                  <Button.Or text={t('button.or', "Or")} />
                  <Popup 
                    position="right center"
                    content={t('page.inventory.popup.clear', "Clear the form to default values")}
                    trigger={<Button type="button" style={{ width: "100px" }} onClick={clearForm}>{t('button.clear', "Clear")}</Button>}
                  />
                  
                </Button.Group>
                {part && part.partId > 0 && (
                  <Button type="button" title="Delete" onClick={(e) => confirmDeleteOpen(e, part)} style={{ marginLeft: "10px" }}>
                    <Icon name="delete" />
                    {t('button.delete', "Delete")}
                  </Button>
                )}
                {saveMessage.length > 0 && <Label pointing="left">{saveMessage}</Label>}
              </Form.Field>

              {/* PART METADATA */}

              <Segment loading={loadingPartMetadata} color="blue">
                <Header dividing as="h3">
                  {t('page.inventory.partMetadata', "Part Metadata")}
                </Header>

                {metadataParts && metadataParts.length > 1 && (
                  <ChooseAlternatePartModal
                    trigger={
                      <Popup
                        hideOnScroll
                        disabled={viewPreferences.helpDisabled}
                        onOpen={disableHelp}
                        content={t('page.inventory.popup.alternateParts', "Choose a different part to extract metadata information from. By default, Binner will give you the most relevant part and with the highest quantity available.")}
                        trigger={
                          <Button secondary>
                            <Icon name="external alternate" color="blue" />
                            {t('page.inventory.chooseAlternatePart', "Choose alternate part ({{count}})", { count: formatNumber(metadataParts.length) } )}
                          </Button>
                        }
                      />
                    }
                    part={part}
                    metadataParts={metadataParts}
                    onPartChosen={(e, p) => handleChooseAlternatePart(e, p, partTypes)}
                  />
                )}

                <Form.Group>
                  <Form.Field width={4}>
                    <label>{t('label.cost', "Cost")}</label>
                    <Input
                      className="labeled"
                      placeholder="0.00"
                      value={part.cost}
                      type="text"
                      onChange={handleChange}
                      name="cost"
                      onFocus={disableKeyboardListening}
                      onBlur={formatField}
                    >
                      <Dropdown 
                        name="currency"
                        className="label currency"
                        placeholder="$"
                        value={part.currency || 'USD'}
                        options={currencyOptions}
                        onChange={handleChange}
                      />
                      <input />
                    </Input>
                  </Form.Field>
                  <Form.Input
                    label={t('label.manufacturer', "Manufacturer")}
                    placeholder="Texas Instruments"
                    value={part.manufacturer || ""}
                    onChange={handleChange}
                    name="manufacturer"
                    width={4}
                    onFocus={disableKeyboardListening}
                    onBlur={enableKeyboardListening}
                  />
                  <Form.Input
                    label={t('label.manufacturerPart', "Manufacturer Part")}
                    placeholder="LM358"
                    value={part.manufacturerPartNumber || ""}
                    onChange={handleChange}
                    name="manufacturerPartNumber"
                    onFocus={disableKeyboardListening}
                    onBlur={enableKeyboardListening}
                  />
                  <Image src={part.imageUrl} size="tiny" />
                </Form.Group>
                <Form.Field width={10}>
                  <label>{t('label.keywords', "Keywords")}</label>
                  <Input
                    icon="tags"
                    iconPosition="left"
                    label={{ tag: true, content: t('page.inventory.addKeyword', "Add Keyword") }}
                    labelPosition="right"
                    placeholder={t('page.inventory.placeholder.keywords', "op amp")}
                    onChange={handleChange}
                    value={part.keywords || ""}
                    name="keywords"
                    onFocus={disableKeyboardListening}
                    onBlur={enableKeyboardListening}
                  />
                </Form.Field>
                <Form.Field width={4}>
                  <label>{t('label.packageType', "Package Type")}</label>
                  <Input
                    placeholder="DIP8"
                    value={part.packageType || ""}
                    onChange={handleChange}
                    name="packageType"
                    onFocus={disableKeyboardListening}
                    onBlur={enableKeyboardListening}
                  />
                </Form.Field>
                <Form.Field
                  width={10}
                  control={TextArea}
                  label={t('label.description', "Description")}
                  value={part.description || ""}
                  onChange={handleChange}
                  name="description"
                  onFocus={disableKeyboardListening}
                  onBlur={enableKeyboardListening}
                />
              </Segment>

              {/* Part Preferences */}
              <Segment loading={loadingPartMetadata} color="green">
                <Header dividing as="h3">
                  {t('page.inventory.privatePartInfo', "Private Part Information")}
                </Header>
                <p>{t('page.inventory.privatePartInfoMessage', "These values can be set manually and will not be synchronized automatically via apis.")}</p>

                <Form.Field>
                  <label>{t('label.primaryDatasheetUrl', "Primary Datasheet Url")}</label>
                  <Input action className='labeled' placeholder='www.ti.com/lit/ds/symlink/lm2904-n.pdf' value={(part.datasheetUrl || '').replace('http://', '').replace('https://', '')} onChange={handleChange} name='datasheetUrl'>
                    <Label>https://</Label>
                    <input onFocus={disableKeyboardListening} onBlur={enableKeyboardListening} />
                    <Button onClick={e => handleVisitLink(e, part.datasheetUrl)} disabled={!part.datasheetUrl || part.datasheetUrl.length === 0}>{t('button.view', "View")}</Button>
                  </Input>
                </Form.Field>
                <Form.Field>
                  <label>{t('label.productUrl', "Product Url")}</label>
                  <Input action className='labeled' placeholder='' value={(part.productUrl || '').replace('http://', '').replace('https://', '')} onChange={handleChange} name='productUrl'>
                    <Label>https://</Label>
                    <input onFocus={disableKeyboardListening} onBlur={enableKeyboardListening} />
                    <Button onClick={e => handleVisitLink(e, part.productUrl)} disabled={!part.productUrl || part.productUrl.length === 0}>{t('button.visit', "Visit")}</Button>
                  </Input>
                </Form.Field>
                <Form.Group>
                  <Form.Field width={4}>
                    <label>{t('label.digikeyPartNumber', "DigiKey Part Number")}</label>
                    <Input placeholder='296-1395-5-ND' value={part.digiKeyPartNumber || ''} onChange={handleChange} name='digiKeyPartNumber' onFocus={disableKeyboardListening} onBlur={enableKeyboardListening} />
                  </Form.Field>
                  <Form.Field width={4}>
                    <label>{t('label.mouserPartNumber', "Mouser Part Number")}</label>
                    <Input placeholder='595-LM358AP' value={part.mouserPartNumber || ''} onChange={handleChange} name='mouserPartNumber' onFocus={disableKeyboardListening} onBlur={enableKeyboardListening} />
                  </Form.Field>
                  <Form.Field width={4}>
                    <label>{t('label.arrowPartNumber', "Arrow Part Number")}</label>
                    <Input placeholder='595-LM358AP' value={part.arrowPartNumber || ''} onChange={handleChange} name='arrowPartNumber' onFocus={disableKeyboardListening} onBlur={enableKeyboardListening} />
                  </Form.Field>
                </Form.Group>
              </Segment>

              {/* Suppliers */}

              <Segment loading={loadingPartMetadata} color="violet">
                <Header dividing as="h3">
                  {t('page.inventory.suppliers', "Suppliers")}
                </Header>
                <div style={{height: '35px'}}>
                  <div style={{float: 'right'}}>
                    <Popup 
                      wide
                      hoverable
                      content={<p>{part.partId <= 0 ? <span><Icon name="warning sign" color="yellow" /> {t('page.inventory.popup.mustAddPart', "You must save the part before adding custom suppliers to it.")}</span> : <span>{t('page.inventory.popup.addSupplier', "Add a manual supplier entry")}</span>}</p>}
                      trigger={<span><Button primary onClick={handleShowAddPartSupplier} size='tiny' disabled={part.partId <= 0}><Icon name="plus" /> {t('button.add', "Add")}</Button></span>}
                    />
                  </div>
                </div>

                {showAddPartSupplier && <Segment raised>
                  <Form.Input width={6} label={t('label.supplier', "Supplier")} required placeholder='DigiKey' focus value={partSupplier.name} onChange={handlePartSupplierChange} name='name' onFocus={disableKeyboardListening} onBlur={enableKeyboardListening} />
                  <Form.Input width={6} label={t('label.supplierPartNumber', "Supplier Part Number")} required placeholder='296-1395-5-ND' value={partSupplier.supplierPartNumber} onChange={handlePartSupplierChange} name='supplierPartNumber' onFocus={disableKeyboardListening} onBlur={enableKeyboardListening} />
                  <Form.Group>
                    <Form.Input width={3} label={t('label.cost', "Cost")} placeholder='0.50' value={partSupplier.cost} onChange={handlePartSupplierChange} name='cost' onFocus={disableKeyboardListening} onBlur={enableKeyboardListening} />
                    <Form.Input width={4} label={t('label.quantityAvailable', "Quantity Available")} placeholder='0' value={partSupplier.quantityAvailable} onChange={handlePartSupplierChange} name='quantityAvailable' onFocus={disableKeyboardListening} onBlur={enableKeyboardListening} />
                    <Form.Input width={5} label={t('label.minimumOrderQuantity', "Minimum Order Quantity")} placeholder='0' value={partSupplier.minimumOrderQuantity} onChange={handlePartSupplierChange} name='minimumOrderQuantity' onFocus={disableKeyboardListening} onBlur={enableKeyboardListening} />
                  </Form.Group>
                  <Form.Field width={12}>
                    <label>{t('label.productUrl', "Product Url")}</label>
                    <Input action className='labeled' placeholder='' value={(partSupplier.productUrl || '').replace('http://', '').replace('https://', '')} onChange={handlePartSupplierChange} name='productUrl' onFocus={disableKeyboardListening} onBlur={enableKeyboardListening}>
                      <Label>https://</Label>
                      <input onFocus={disableKeyboardListening} onBlur={enableKeyboardListening} />
                      <Button onClick={e => handleVisitLink(e, partSupplier.productUrl)} disabled={!partSupplier.productUrl || partSupplier.productUrl.length === 0}>{t('button.visit', "Visit")}</Button>
                    </Input>
                  </Form.Field>
                  <Form.Field width={12}>
                    <label>{t('label.imageUrl', "Image Url")}</label>
                    <Input action className='labeled' placeholder='' value={(partSupplier.imageUrl || '').replace('http://', '').replace('https://', '')} onChange={handlePartSupplierChange} name='imageUrl' onFocus={disableKeyboardListening} onBlur={enableKeyboardListening}>
                      <Label>https://</Label>
                      <input onFocus={disableKeyboardListening} onBlur={enableKeyboardListening} />
                      <Button onClick={e => handleVisitLink(e, partSupplier.imageUrl)} disabled={!partSupplier.imageUrl || partSupplier.imageUrl.length === 0}>{t('button.visit', "Visit")}</Button>
                    </Input>
                  </Form.Field>
                  <Button primary icon onClick={createPartSupplier} disabled={part.partId <= 0}><Icon name='save' /> {t('button.save', "Save")}</Button>
                </Segment>}

                <Table compact celled sortable selectable striped unstackable size="small">
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell textAlign="center">{t('label.supplier', "Supplier")}</Table.HeaderCell>
                      <Table.HeaderCell textAlign="center">{t('label.supplierPartNumber', "Supplier Part Number")}</Table.HeaderCell>
                      <Table.HeaderCell textAlign="center">{t('label.cost', "Cost")}</Table.HeaderCell>
                      <Table.HeaderCell textAlign="center">{t('label.quantityAvailable', "Quantity Available")}</Table.HeaderCell>
                      <Table.HeaderCell textAlign="center">{t('label.minimumOrderQuantity', "Minimum Order Quantity")}</Table.HeaderCell>
                      <Table.HeaderCell textAlign="center">{t('label.image', "Image")}</Table.HeaderCell>
                      <Table.HeaderCell textAlign="center">{t('label.productUrl', "Product Url")}</Table.HeaderCell>
                      <Table.HeaderCell></Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {part &&
                      metadataParts &&
                      _.filter(metadataParts, (p) => p.manufacturerPartNumber === part.manufacturerPartNumber).map((supplier, supplierKey) => (
                        <Table.Row key={supplierKey}>
                          <Table.Cell textAlign="center">{supplier.supplier}</Table.Cell>
                          <Table.Cell textAlign="center">{supplier.supplierPartNumber}</Table.Cell>
                          <Table.Cell textAlign="center">{formatCurrency(supplier.cost, supplier.currency)}</Table.Cell>
                          <Table.Cell textAlign="center">{formatNumber(supplier.quantityAvailable)}</Table.Cell>
                          <Table.Cell textAlign="center">{formatNumber(supplier.minimumOrderQuantity)}</Table.Cell>
                          <Table.Cell textAlign="center">
                            {supplier.imageUrl && supplier.imageUrl.length > 10 && supplier.imageUrl.startsWith('http') && <img src={supplier.imageUrl} alt={supplier.supplierPartNumber} className="product productshot" />}
                          </Table.Cell>
                          <Table.Cell textAlign="center">
                            {supplier.productUrl && supplier.productUrl.length > 10 && supplier.productUrl.startsWith('http') && <a href={supplier.productUrl} target="_blank" rel="noreferrer">
                            {t('button.visit', "Visit")}
                            </a>}
                          </Table.Cell>
                          <Table.Cell textAlign="center">
                            {supplier.partSupplierId && supplier.partSupplierId > 0 && <Button icon='delete' size='tiny' onClick={e => deletePartSupplier(e, supplier)} title="Delete supplier part" />}
                          </Table.Cell>
                        </Table.Row>
                      ))}
                  </Table.Body>
                </Table>
              </Segment>
            </Grid.Column>

            <Grid.Column width={4} className="right-column">
              {/** RIGHT COLUMN */}

              <Menu className="shortcuts">
                <Menu.Item onClick={(e) => visitAnchor(e, "#datasheets")}>{t('page.inventory.datasheets', "Datasheets")}</Menu.Item>
                <Menu.Item onClick={(e) => visitAnchor(e, "#pinout")}>{t('page.inventory.pinout', "Pinout")}</Menu.Item>
                <Menu.Item onClick={(e) => visitAnchor(e, "#circuits")}>{t('page.inventory.circuits', "Circuits")}</Menu.Item>
              </Menu>

              {/* Product Images Carousel */}
              <Dropzone onUpload={onUploadSubmit} onError={onUploadError} type={GetTypeName(StoredFileType, StoredFileType.ProductImage)}>
                <Card color="blue">
                  {infoResponse && infoResponse.productImages && infoResponse.productImages.length > 0 ? (
                    <Carousel variant="dark" interval={ProductImageIntervalMs} className="centered product-images">
                      {infoResponse.productImages?.filter(x => x.value.length > 0)?.map((productImage, imageKey) => (
                        <Carousel.Item key={imageKey}>
                          <Image src={productImage.value} size="large" />
                          {productImage.id && (
                            <Popup
                              position="top left"
                              content={t('page.inventory.popup.deleteLocalFile', "Delete this local file")}
                              trigger={
                                <Button
                                  onClick={(e) => confirmDeleteLocalFileOpen(e, productImage, "productImages")}
                                  type="button"
                                  size="tiny"
                                  style={{ position: "absolute", top: "4px", right: "2px", padding: "2px", zIndex: "9999" }}
                                  color="red"
                                >
                                  <Icon name="delete" style={{ margin: 0 }} />
                                </Button>
                              }
                            />
                          )}
                          <Carousel.Caption>
                            <h5>{productImage.name}</h5>
                          </Carousel.Caption>
                        </Carousel.Item>
                      ))}
                    </Carousel>
                  ) : (
                    <Placeholder>
                      <img src="/image/microchip.png" className="square" alt="" />
                    </Placeholder>
                  )}

                  <Card.Content>
                    <Loader active={loadingPartMetadata} inline size="small" as="i" style={{ float: "right" }} />
                    <Header as="h4">
                      <Icon name="images" />
                      {t('page.inventory.productImages', "Product Images")}
                    </Header>
                  </Card.Content>
                </Card>
              </Dropzone>

              {/* DATASHEETS */}
              <Dropzone onUpload={onUploadSubmit} onError={onUploadError} type={GetTypeName(StoredFileType, StoredFileType.Datasheet)}>
                <Card id="datasheets" color="green">
                  {infoResponse && infoResponse.datasheets && infoResponse.datasheets.length > 0 ? (
                    <div>
                      <Carousel variant="dark" interval={null} onSelect={onCurrentDatasheetChanged} className="datasheets">
                        {infoResponse.datasheets.map((datasheet, datasheetKey) => (
                          <Carousel.Item key={datasheetKey} onClick={(e) => handleVisitLink(e, datasheet.value.datasheetUrl)} {...getDatasheetAttributes(datasheet)}>
                            <Image src={datasheet.value.imageUrl} size="large" />
                            {datasheet.id && (
                              <Popup
                                position="top left"
                                content={t('page.inventory.popup.deleteLocalFile', "Delete this local file")}
                                trigger={
                                  <Button
                                    onClick={(e) => confirmDeleteLocalFileOpen(e, datasheet, "datasheets")}
                                    type="button"
                                    size="tiny"
                                    style={{ position: "absolute", top: "4px", right: "2px", padding: "2px", zIndex: "9999" }}
                                    color="red"
                                  >
                                    <Icon name="delete" style={{ margin: 0 }} />
                                  </Button>
                                }
                              />
                            )}
                          </Carousel.Item>
                        ))}
                      </Carousel>
                      <Card.Content style={{ textAlign: "left" }}>
                        <Card.Header>{datasheetTitle}</Card.Header>
                        <Card.Meta>
                          {datasheetPartName}, {datasheetManufacturer}
                        </Card.Meta>
                        <Card.Description>{datasheetDescription}</Card.Description>
                      </Card.Content>
                    </div>
                  ) : (
                    <Placeholder>
                      <img src="/image/datasheet.png" className="square" alt="" />
                      <Placeholder.Header>
                        <Placeholder.Line length="very long" />
                        <Placeholder.Line length="medium" />
                        <Placeholder.Line length="short" />
                      </Placeholder.Header>
                    </Placeholder>
                  )}
                  <Card.Content extra>
                    <Header as="h4">
                      <Icon name="file pdf" />
                      {t('page.inventory.datasheets', "Datasheets")}
                    </Header>
                  </Card.Content>
                </Card>
              </Dropzone>

              {/* PINOUT */}

              <Dropzone onUpload={onUploadSubmit} onError={onUploadError} type={GetTypeName(StoredFileType, StoredFileType.Pinout)}>
                <Card id="pinout" color="purple">
                  {infoResponse && infoResponse.pinoutImages && infoResponse.pinoutImages.length > 0 ? (
                    <div>
                      <Carousel variant="dark" interval={null} className="pinout-images">
                        {infoResponse.pinoutImages.map((pinout, pinoutKey) => (
                          <Carousel.Item key={pinoutKey}>
                            <Image src={pinout.value} size="large" />
                            {pinout.id && (
                              <Popup
                                position="top left"
                                content={t('page.inventory.popup.deleteLocalFile', "Delete this local file")}
                                trigger={
                                  <Button
                                    onClick={(e) => confirmDeleteLocalFileOpen(e, pinout, "pinoutImages")}
                                    type="button"
                                    size="tiny"
                                    style={{ position: "absolute", top: "4px", right: "2px", padding: "2px", zIndex: "9999" }}
                                    color="red"
                                  >
                                    <Icon name="delete" style={{ margin: 0 }} />
                                  </Button>
                                }
                              />
                            )}
                            <Carousel.Caption>
                              <h5>{pinout.name}</h5>
                            </Carousel.Caption>
                          </Carousel.Item>
                        ))}
                      </Carousel>
                    </div>
                  ) : (
                    <Placeholder>
                      <img src="/image/pinout.png" className="square" alt="" />
                    </Placeholder>
                  )}
                  <Card.Content extra>
                    <Header as="h4">
                      <Icon name="pin" />
                      {t('page.inventory.pinout', "Pinout")}
                    </Header>
                  </Card.Content>
                </Card>
              </Dropzone>

              {/* CIRCUITS */}

              <Dropzone onUpload={onUploadSubmit} onError={onUploadError} type={GetTypeName(StoredFileType, StoredFileType.ReferenceDesign)}>
                <Card id="circuits" color="violet">
                  {infoResponse && infoResponse.circuitImages && infoResponse.circuitImages.length > 0 ? (
                    <div>
                      <Carousel variant="dark" interval={null} className="circuit-images">
                        {infoResponse.circuitImages.map((circuit, circuitKey) => (
                          <Carousel.Item key={circuitKey}>
                            <Image src={circuit.value} size="large" />
                            {circuit.id && (
                              <Popup
                                position="top left"
                                content={t('page.inventory.popup.deleteLocalFile', "Delete this local file")}
                                trigger={
                                  <Button
                                    onClick={(e) => confirmDeleteLocalFileOpen(e, circuit, "circuitImages")}
                                    type="button"
                                    size="tiny"
                                    style={{ position: "absolute", top: "4px", right: "2px", padding: "2px", zIndex: "9999" }}
                                    color="red"
                                  >
                                    <Icon name="delete" style={{ margin: 0 }} />
                                  </Button>
                                }
                              />
                            )}
                            <Carousel.Caption>
                              <h5>{circuit.name}</h5>
                            </Carousel.Caption>
                          </Carousel.Item>
                        ))}
                      </Carousel>
                    </div>
                  ) : (
                    <Placeholder>
                      <img src="/image/referencedesign.png" className="square" alt="" />
                    </Placeholder>
                  )}
                  <Card.Content extra>
                    <Header as="h4">
                      <Icon name="microchip" />
                      {t('page.inventory.referenceDesigns', "Reference Designs")}
                    </Header>
                  </Card.Content>
                </Card>
              </Dropzone>

              {/* END LEFT COLUMN */}
            </Grid.Column>
          </Grid.Row>
        </Grid>

        <Modal centered open={bulkScanIsOpen} onClose={handleBulkScanClose}>
          <Modal.Header>{t('page.inventory.bulkScan', "Bulk Scan")}</Modal.Header>
          <Modal.Content>
            <div style={{ width: "200px", height: "100px", margin: "auto" }}>
              <div className="anim-box">
                <div className="scanner animated" />
                <div className="anim-item anim-item-sm"></div>
                <div className="anim-item anim-item-lg"></div>
                <div className="anim-item anim-item-lg"></div>
                <div className="anim-item anim-item-sm"></div>
                <div className="anim-item anim-item-lg"></div>
                <div className="anim-item anim-item-sm"></div>
                <div className="anim-item anim-item-md"></div>
                <div className="anim-item anim-item-sm"></div>
                <div className="anim-item anim-item-md"></div>
                <div className="anim-item anim-item-lg"></div>
                <div className="anim-item anim-item-sm"></div>
                <div className="anim-item anim-item-sm"></div>
                <div className="anim-item anim-item-lg"></div>
                <div className="anim-item anim-item-sm"></div>
                <div className="anim-item anim-item-lg"></div>
                <div className="anim-item anim-item-sm"></div>
                <div className="anim-item anim-item-lg"></div>
                <div className="anim-item anim-item-sm"></div>
                <div className="anim-item anim-item-md"></div>
                <div className="anim-item anim-item-md"></div>
                <div className="anim-item anim-item-lg"></div>
                <div className="anim-item anim-item-sm"></div>
                <div className="anim-item anim-item-sm"></div>
                <div className="anim-item anim-item-lg"></div>
                <div className="anim-item anim-item-sm"></div>
                <div className="anim-item anim-item-lg"></div>
                <div className="anim-item anim-item-md"></div>
                <div className="anim-item anim-item-lg"></div>
                <div className="anim-item anim-item-sm"></div>
                <div className="anim-item anim-item-md"></div>
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <p>{t('page.inventory.startScanning', "Start scanning parts...")}</p>
              <div style={{textAlign: 'right', height: '35px', width: '100%'}}>
                <Button size='mini' onClick={handleAddBulkScanRow}><Icon name="plus" /> {t('button.manualAdd', "Manual Add")}</Button>
              </div>
              {renderScannedParts(scannedParts, highlightScannedPart)}
            </div>
          </Modal.Content>
          <Modal.Actions>
            <Button onClick={handleBulkScanClose}>{t('button.cancel', "Cancel")}</Button>
            <Button primary onClick={onSubmitScannedParts} disabled={bulkScanSaving}>
            {t('button.save', "Save")}
            </Button>
          </Modal.Actions>
        </Modal>
      </Form>
      <br />
      <div style={{ marginTop: "20px" }}>
        <Segment style={{ minHeight: "50px" }} color="teal">
          <Header dividing as="h3">
          {t('page.inventory.recentlyAdded', "Recently Added")}
          </Header>
          <Dimmer active={loadingRecent} inverted>
            <Loader inverted />
          </Dimmer>
          {!loadingRecent && recentParts && renderRecentParts(recentParts)}
        </Segment>
      </div>
    </div>
  );
}

Inventory.partAbortController = new AbortController();
Inventory.infoAbortController = new AbortController();

// eslint-disable-next-line import/no-anonymous-default-export
export default (props) => <Inventory {...props} params={useParams()} history={useNavigate()} />;

Inventory.propTypes = {
  partNumber: PropTypes.string
};

Inventory.defaultProps = {
  partNumber: ""
};
