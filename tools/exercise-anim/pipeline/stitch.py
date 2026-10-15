import cv2, numpy as np, sys
ims=[cv2.imread(p) for p in sys.argv[2:]]
ims=[i for i in ims if i is not None]
h=min(i.shape[0] for i in ims)
cv2.imwrite(sys.argv[1], np.hstack([cv2.resize(i,(int(i.shape[1]*h/i.shape[0]),h)) for i in ims]))
