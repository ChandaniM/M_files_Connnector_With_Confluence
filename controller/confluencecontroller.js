import { getConfluenceData } from "../service/confluenceservice.js";

export const getConfluenceController = async (req, res) => {
  try {
    let responseFromService = await getConfluenceData();
    if(responseFromService.error == ''){
      res.send(responseFromService?.result);
    }else{
      res.send(responseFromService.error);
    }
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

export default {
  getConfluenceController,
};
